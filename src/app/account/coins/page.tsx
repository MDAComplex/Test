import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getRank } from "@/lib/rewards";
import RewardIcon from "@/components/RewardIcon";
import { Wallet, ArrowUpRight, ArrowDownRight } from "lucide-react";

export default async function CoinsPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login?callbackUrl=/account/coins");

  const [user, transactions] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.coinTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  if (!user) redirect("/login");

  const { current } = getRank(user.coins);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <Link href="/account" className="text-sm text-[#6b6b76] hover:text-[#1c1c1f]">
          ← Mein Konto
        </Link>
        <h1 className="text-2xl font-bold mt-2">Coins-Verlauf</h1>
      </div>

      <div className="bg-white border border-[#e5e5e8] rounded-2xl p-6 flex items-center justify-between">
        <div>
          <p className="text-xs text-[#6b6b76]">Aktuelles Guthaben</p>
          <p className="text-3xl font-extrabold text-[#1faa59] flex items-center gap-2">
            <Wallet size={24} className="text-[#ff5a1f]" /> {user.coins} Coins
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-[#6b6b76]">Rang</p>
          <p className="font-bold flex items-center gap-1.5 justify-end">
            <RewardIcon iconKey={current.iconKey} size={18} className="text-[#ff5a1f]" />
            {current.label}
          </p>
        </div>
      </div>

      <div className="bg-white border border-[#e5e5e8] rounded-2xl p-6">
        <h2 className="font-bold mb-3">Transaktionen</h2>
        {transactions.length === 0 ? (
          <p className="text-sm text-[#6b6b76]">
            Noch keine Coin-Transaktionen. Bestelle etwas oder erledige Tagesquests, um Coins zu sammeln.
          </p>
        ) : (
          <ul className="divide-y divide-[#e5e5e8]">
            {transactions.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="flex items-center gap-2 min-w-0">
                  {t.amount >= 0 ? (
                    <ArrowUpRight size={15} className="text-[#1faa59] shrink-0" />
                  ) : (
                    <ArrowDownRight size={15} className="text-red-500 shrink-0" />
                  )}
                  <span className="truncate">{t.reason}</span>
                </span>
                <span className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-[#6b6b76]">
                    {t.createdAt.toLocaleDateString("de-DE")} ·{" "}
                    {t.createdAt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className={`font-bold ${t.amount >= 0 ? "text-[#1faa59]" : "text-red-500"}`}>
                    {t.amount >= 0 ? `+${t.amount}` : t.amount}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link href="/rewards" className="text-sm text-[#ff5a1f] font-medium underline">
        Alle Rewards, Quests & Glücksrad ansehen →
      </Link>
    </div>
  );
}
