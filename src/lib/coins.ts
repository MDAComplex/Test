// Zentrale Coin-Buchhaltung: jede Coin-Änderung läuft über grantCoins/spendCoins,
// damit User.coins und der Coins-Verlauf (CoinTransaction) immer konsistent sind.
import { prisma } from "@/lib/prisma";

/**
 * Schreibt einem Nutzer Coins gut und legt eine CoinTransaction an.
 * Gibt den neuen Kontostand zurück.
 */
export async function grantCoins(userId: string, amount: number, reason: string): Promise<number> {
  const value = Math.max(0, Math.round(amount));
  if (value === 0) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    return user?.coins ?? 0;
  }
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { coins: { increment: value } },
  });
  await prisma.coinTransaction.create({
    data: { userId, amount: value, reason },
  });
  return updated.coins;
}

/**
 * Zieht einem Nutzer Coins ab (nie unter 0) und legt eine CoinTransaction mit
 * negativem Betrag über den tatsächlich abgezogenen Wert an.
 * Gibt den neuen Kontostand zurück.
 */
export async function spendCoins(userId: string, amount: number, reason: string): Promise<number> {
  const requested = Math.max(0, Math.round(amount));
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return 0;
  const actual = Math.min(requested, user.coins);
  if (actual === 0) return user.coins;
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { coins: user.coins - actual },
  });
  await prisma.coinTransaction.create({
    data: { userId, amount: -actual, reason },
  });
  return updated.coins;
}
