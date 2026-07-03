import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getRank, getTodayQuests, getUserBadges, canClaimMysteryBox, grantDeliveryRewards } from "@/lib/rewards";
import { claimMysteryBoxAction } from "@/lib/actions";
import RewardIcon from "@/components/RewardIcon";
import { Gift, Flame, PiggyBank, Dices, ClipboardList, Award, BarChart3, CheckCircle, Hourglass } from "lucide-react";

export default async function RewardsPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login?callbackUrl=/rewards");

  await grantDeliveryRewards(userId);

  const [user, quests, badges, canClaim] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    getTodayQuests(userId),
    getUserBadges(userId),
    canClaimMysteryBox(userId),
  ]);
  if (!user) redirect("/login");

  const { current, next } = getRank(user.coins);
  const progressToNext = next ? Math.min(100, Math.round(((user.coins - current.min) / (next.min - current.min)) * 100)) : 100;

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const leaderboard = await prisma.order.groupBy({
    by: ["userId"],
    where: { placedAt: { gte: weekStart } },
    _sum: { total: true },
  });
  const top = leaderboard
    .map((l) => ({ userId: l.userId, saved: l._sum.total ?? 0 }))
    .sort((a, b) => b.saved - a.saved)
    .slice(0, 10);
  const topUsers = await prisma.user.findMany({ where: { id: { in: top.map((t) => t.userId) } } });
  const leaderboardWithNames = top.map((t) => ({
    saved: t.saved,
    name: topUsers.find((u) => u.id === t.userId)?.name || topUsers.find((u) => u.id === t.userId)?.email || "?",
    isYou: t.userId === userId,
  }));

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Gift size={22} className="text-[#ff5a1f]" /> Deine Rewards
      </h1>

      <div className="bg-[#ffffff] border border-[#e5e5e8] rounded-2xl p-6 space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-xs text-[#6b6b76]">Coins</p>
            <p className="text-3xl font-extrabold text-[#1faa59]">{user.coins}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[#6b6b76]">Rang</p>
            <p className="text-xl font-extrabold flex items-center gap-1.5 justify-end">
              <RewardIcon iconKey={current.iconKey} size={20} className="text-[#ff5a1f]" />
              {current.label}
            </p>
          </div>
        </div>
        {next && (
          <div>
            <div className="flex justify-between text-xs text-[#6b6b76] mb-1">
              <span className="font-semibold text-[#1c1c1f]">Fortschritt zum nächsten Rang</span>
              <span>{progressToNext}%</span>
            </div>
            <div className="w-full h-2.5 bg-[#f4f4f5] rounded-full overflow-hidden">
              <div className="h-full bg-[#ff5a1f]" style={{ width: `${progressToNext}%` }} />
            </div>
            <p className="text-xs text-[#6b6b76] mt-1 flex items-center gap-1">
              Noch {next.min - user.coins} Coins bis{" "}
              <RewardIcon iconKey={next.iconKey} size={12} className="text-[#ff5a1f]" /> {next.label}
            </p>
          </div>
        )}
        <div className="flex items-center gap-2 text-sm bg-[#fff7ed] border border-[#ffd6c2] rounded-xl p-3">
          <Flame size={20} className="text-[#ff5a1f] shrink-0" />
          <span className="font-bold text-[#ff5a1f]">{user.streak} Tage Streak</span>
          <span className="text-[#6b6b76]">— jeden Tag einloggen für Bonus-Coins</span>
        </div>
        <div className="bg-[#eafbf1] rounded-xl p-3 text-sm flex items-center gap-2">
          <PiggyBank size={16} className="text-[#1faa59]" />
          Gespart gesamt: <span className="text-[#1faa59] font-bold">{user.totalSaved.toFixed(2)} €</span>
        </div>
      </div>

      <div className="bg-[#ffffff] border border-[#e5e5e8] rounded-2xl p-6">
        <h2 className="font-bold mb-3 flex items-center gap-2"><Dices size={18} className="text-[#ff5a1f]" /> Mystery Box (täglich)</h2>
        {canClaim ? (
          <form
            action={async () => {
              "use server";
              await claimMysteryBoxAction();
            }}
          >
            <button className="w-full bg-gradient-to-r from-[#ff5a1f] to-[#1faa59] text-black font-bold py-3 rounded-lg glow-accent flex items-center justify-center gap-2">
              <Gift size={18} /> Box öffnen
            </button>
          </form>
        ) : (
          <p className="text-sm text-[#6b6b76] flex items-center gap-1.5">
            <Hourglass size={14} /> Heute schon geöffnet — komm morgen wieder!
          </p>
        )}
      </div>

      <div className="bg-[#ffffff] border border-[#e5e5e8] rounded-2xl p-6">
        <h2 className="font-bold mb-3 flex items-center gap-2"><ClipboardList size={18} className="text-[#ff5a1f]" /> Tagesquests</h2>
        <div className="space-y-3">
          {quests.map((q) => (
            <div key={q.key}>
              <div className="flex justify-between text-sm mb-1">
                <span className={`flex items-center gap-1 ${q.completed ? "text-[#1faa59]" : ""}`}>
                  {q.completed && <CheckCircle size={14} className="shrink-0" />}
                  {q.label}
                </span>
                <span className="text-[#6b6b76]">+{q.reward} Coins</span>
              </div>
              <div className="w-full h-1.5 bg-[#f4f4f5] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#ff5a1f]"
                  style={{ width: `${Math.min(100, Math.round((q.progress / q.target) * 100))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[#ffffff] border border-[#e5e5e8] rounded-2xl p-6">
        <h2 className="font-bold mb-3 flex items-center gap-2"><Award size={18} className="text-[#ff5a1f]" /> Badges</h2>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {badges.map((b) => (
            <div
              key={b.key}
              className={`flex flex-col items-center text-center p-2 rounded-xl border ${
                b.earned ? "bg-[#eafbf1] border-[#ff5a1f]/50" : "bg-[#ffffff] border-[#e5e5e8] opacity-40"
              }`}
            >
              <RewardIcon iconKey={b.iconKey} size={24} className={b.earned ? "text-[#ff5a1f]" : "text-[#6b6b76]"} />
              <span className="text-[10px] mt-1">{b.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[#ffffff] border border-[#e5e5e8] rounded-2xl p-6">
        <h2 className="font-bold mb-3 flex items-center gap-2"><BarChart3 size={18} className="text-[#ff5a1f]" /> Wochen-Leaderboard (gespart)</h2>
        {leaderboardWithNames.length === 0 ? (
          <p className="text-sm text-[#6b6b76]">Noch keine Bestellungen diese Woche.</p>
        ) : (
          <ol className="space-y-1 text-sm">
            {leaderboardWithNames.map((l, i) => (
              <li key={i} className={`flex justify-between ${l.isYou ? "text-[#ff5a1f] font-semibold" : ""}`}>
                <span>{i + 1}. {l.name} {l.isYou ? "(du)" : ""}</span>
                <span>{l.saved.toFixed(2)} €</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
