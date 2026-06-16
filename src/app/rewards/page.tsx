import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getRank, getTodayQuests, getUserBadges, canClaimMysteryBox } from "@/lib/rewards";
import { claimMysteryBoxAction } from "@/lib/actions";

export default async function RewardsPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login?callbackUrl=/rewards");

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
      <h1 className="text-2xl font-bold">🎁 Deine Rewards</h1>

      <div className="bg-[#1a1a22] border border-[#2c2c38] rounded-2xl p-6 space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-xs text-[#6b6b7a]">Coins</p>
            <p className="text-3xl font-extrabold text-[#00f0c0]">{user.coins}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[#6b6b7a]">Rang</p>
            <p className="text-xl font-extrabold">{current.emoji} {current.label}</p>
          </div>
        </div>
        {next && (
          <div>
            <div className="w-full h-2 bg-[#22222c] rounded-full overflow-hidden">
              <div className="h-full bg-[#ff2d92]" style={{ width: `${progressToNext}%` }} />
            </div>
            <p className="text-xs text-[#6b6b7a] mt-1">
              Noch {next.min - user.coins} Coins bis {next.emoji} {next.label}
            </p>
          </div>
        )}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-lg">🔥</span>
          <span className="font-semibold">{user.streak} Tage Streak</span>
          <span className="text-[#6b6b7a]">— jeden Tag einloggen für Bonus-Coins</span>
        </div>
        <div className="bg-[#22222c] rounded-xl p-3 text-sm">
          💰 Gespart gesamt: <span className="text-[#00f0c0] font-bold">{user.totalSaved.toFixed(2)} €</span>
        </div>
      </div>

      <div className="bg-[#1a1a22] border border-[#2c2c38] rounded-2xl p-6">
        <h2 className="font-bold mb-3">🎰 Mystery Box (täglich)</h2>
        {canClaim ? (
          <form
            action={async () => {
              "use server";
              await claimMysteryBoxAction();
            }}
          >
            <button className="w-full bg-gradient-to-r from-[#ff2d92] to-[#00f0c0] text-black font-bold py-3 rounded-xl glow-accent">
              🎁 Box öffnen
            </button>
          </form>
        ) : (
          <p className="text-sm text-[#6b6b7a]">Heute schon geöffnet — komm morgen wieder! ⏳</p>
        )}
      </div>

      <div className="bg-[#1a1a22] border border-[#2c2c38] rounded-2xl p-6">
        <h2 className="font-bold mb-3">📋 Tagesquests</h2>
        <div className="space-y-3">
          {quests.map((q) => (
            <div key={q.key}>
              <div className="flex justify-between text-sm mb-1">
                <span className={q.completed ? "text-[#00f0c0]" : ""}>
                  {q.completed ? "✅ " : ""}{q.label}
                </span>
                <span className="text-[#6b6b7a]">+{q.reward} Coins</span>
              </div>
              <div className="w-full h-1.5 bg-[#22222c] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#ff2d92]"
                  style={{ width: `${Math.min(100, Math.round((q.progress / q.target) * 100))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[#1a1a22] border border-[#2c2c38] rounded-2xl p-6">
        <h2 className="font-bold mb-3">🏅 Badges</h2>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {badges.map((b) => (
            <div
              key={b.key}
              className={`flex flex-col items-center text-center p-2 rounded-xl border ${
                b.earned ? "bg-[#22222c] border-[#ff2d92]/50" : "bg-[#1a1a22] border-[#2c2c38] opacity-40"
              }`}
            >
              <span className="text-2xl">{b.emoji}</span>
              <span className="text-[10px] mt-1">{b.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[#1a1a22] border border-[#2c2c38] rounded-2xl p-6">
        <h2 className="font-bold mb-3">📊 Wochen-Leaderboard (gespart)</h2>
        {leaderboardWithNames.length === 0 ? (
          <p className="text-sm text-[#6b6b7a]">Noch keine Bestellungen diese Woche.</p>
        ) : (
          <ol className="space-y-1 text-sm">
            {leaderboardWithNames.map((l, i) => (
              <li key={i} className={`flex justify-between ${l.isYou ? "text-[#ff2d92] font-semibold" : ""}`}>
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
