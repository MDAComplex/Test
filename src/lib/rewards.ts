import { prisma } from "@/lib/prisma";
import { getShipmentProgress, getTrackingNumber, isShippedOrLater } from "@/lib/shipping";
import { grantCoins } from "@/lib/coins";
import { sendShopEmail, shopEmailHtml } from "@/lib/email";

// iconKey wird im UI auf lucide-Icons gemappt (siehe components/RewardIcon.tsx) — keine Emojis im UI.
export const RANKS = [
  { key: "window-shopper", min: 0, label: "Window Shopper", iconKey: "store" },
  { key: "trendsetter", min: 100, label: "Trendsetter", iconKey: "sparkles" },
  { key: "drip-lord", min: 300, label: "Drip Lord", iconKey: "gem" },
  { key: "icon", min: 700, label: "Ikone", iconKey: "crown" },
] as const;

export function getRank(coins: number) {
  let current: (typeof RANKS)[number] = RANKS[0];
  for (const r of RANKS) {
    if (coins >= r.min) current = r;
  }
  const next = RANKS.find((r) => r.min > coins);
  return { current, next };
}

export const QUESTS = [
  { key: "cart3", label: "Lege 3 verschiedene Artikel in den Warenkorb", target: 3, reward: 15 },
  { key: "browse5", label: "Schau dir 5 Produkte an", target: 5, reward: 10 },
  { key: "cart50", label: "Erreiche 50 € im Warenkorb", target: 50, reward: 20 },
] as const;

export const BADGES = [
  { key: "first-order", label: "Erste Bestellung", iconKey: "party" },
  { key: "ten-orders", label: "10 Bestellungen", iconKey: "trophy" },
  { key: "beauty-addict", label: "Beauty-Addict", iconKey: "heart" },
  { key: "night-owl", label: "Nachteule", iconKey: "moon" },
  { key: "streak-7", label: "7 Tage Streak", iconKey: "flame" },
] as const;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export async function touchDailyLogin(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const today = todayKey();
  if (user.lastLoginDate === today) return;

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const continuesStreak = user.lastLoginDate === yesterday;
  const newStreak = continuesStreak ? user.streak + 1 : 1;
  const bonus = 5 + Math.min(newStreak, 10) * 2;

  await prisma.user.update({
    where: { id: userId },
    data: { streak: newStreak, lastLoginDate: today },
  });
  await grantCoins(userId, bonus, "Täglicher Login-Bonus");
}

export async function bumpQuest(userId: string, questKey: "cart3" | "browse5", incrementBy = 1) {
  const date = todayKey();
  const quest = QUESTS.find((q) => q.key === questKey)!;

  const existing = await prisma.questProgress.upsert({
    where: { userId_date_questKey: { userId, date, questKey } },
    update: {},
    create: { userId, date, questKey, progress: 0, completed: false },
  });

  if (existing.completed) return;

  const newProgress = existing.progress + incrementBy;
  const completed = newProgress >= quest.target;

  await prisma.questProgress.update({
    where: { id: existing.id },
    data: { progress: newProgress, completed },
  });

  if (completed) {
    await grantCoins(userId, quest.reward, "Tagesquest");
  }
}

export async function setQuestProgressAbsolute(userId: string, questKey: "cart50", value: number) {
  const date = todayKey();
  const quest = QUESTS.find((q) => q.key === questKey)!;

  const existing = await prisma.questProgress.upsert({
    where: { userId_date_questKey: { userId, date, questKey } },
    update: {},
    create: { userId, date, questKey, progress: 0, completed: false },
  });

  if (existing.completed) return;

  const completed = value >= quest.target;

  await prisma.questProgress.update({
    where: { id: existing.id },
    data: { progress: Math.max(existing.progress, value), completed },
  });

  if (completed) {
    await grantCoins(userId, quest.reward, "Tagesquest");
  }
}

export async function getTodayQuests(userId: string) {
  const date = todayKey();
  const progress = await prisma.questProgress.findMany({ where: { userId, date } });

  return QUESTS.map((q) => {
    const p = progress.find((x) => x.questKey === q.key);
    return { ...q, progress: p?.progress ?? 0, completed: p?.completed ?? false };
  });
}

/**
 * Lazy-Check bei Seitenaufrufen: findet zugestellte Bestellungen ohne gutgeschriebenen
 * Lieferbonus, schreibt Coins gut und legt Benachrichtigungen (Versand + Zustellung) an.
 * Gibt die frisch gutgeschriebenen Boni zurück (für Erfolgs-Banner).
 */
export async function grantDeliveryRewards(userId: string) {
  const [orders, notifications, user] = await Promise.all([
    prisma.order.findMany({ where: { userId }, orderBy: { placedAt: "desc" }, take: 30 }),
    prisma.notification.findMany({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);

  const granted: { orderId: string; coins: number }[] = [];

  for (const order of orders) {
    const { currentStatus } = getShipmentProgress(order);
    const shortId = order.id.slice(-6).toUpperCase();

    // Versandbestätigung einmalig anlegen (Dedup über Bestell-ID im Body).
    if (isShippedOrLater(currentStatus)) {
      const exists = notifications.some((n) => n.title === "Versandbestätigung" && n.body.includes(order.id));
      if (!exists) {
        await prisma.notification.create({
          data: {
            userId,
            title: "Versandbestätigung",
            body: `Deine Bestellung #${shortId} wurde an den Versanddienstleister übergeben. Sendungsnummer: ${getTrackingNumber(order.id)}. (Ref: ${order.id})`,
          },
        });
        // Echte Mail nur, wenn RESEND_API_KEY gesetzt ist; darf nie blockieren.
        if (user?.email) {
          try {
            await sendShopEmail(
              user.email,
              `Versandbestätigung #${shortId} – Viralo.shop`,
              shopEmailHtml(
                "Deine Bestellung ist unterwegs",
                `Bestellung #${shortId} wurde an den Versanddienstleister übergeben. Sendungsnummer: ${getTrackingNumber(order.id)}.`
              )
            );
          } catch (error) {
            console.error("Versand-Mail fehlgeschlagen (ignoriert):", error);
          }
        }
      }
    }

    if (currentStatus === "DELIVERED" && !order.rewardGranted) {
      const coins = Math.max(5, Math.round(order.total * 0.1));
      await prisma.order.update({ where: { id: order.id }, data: { rewardGranted: true } });
      await grantCoins(userId, coins, `Lieferbonus Bestellung #${shortId}`);
      await prisma.notification.create({
        data: {
          userId,
          title: "Deine Bestellung wurde zugestellt",
          body: `Bestellung #${shortId} wurde zugestellt. Dein Lieferbonus von ${coins} Coins wurde gutgeschrieben. (Ref: ${order.id})`,
        },
      });
      if (user?.email) {
        try {
          await sendShopEmail(
            user.email,
            `Zugestellt: Bestellung #${shortId} – Viralo.shop`,
            shopEmailHtml(
              "Deine Bestellung wurde zugestellt",
              `Bestellung #${shortId} wurde zugestellt. Dein Lieferbonus von ${coins} Coins wurde gutgeschrieben.`
            )
          );
        } catch (error) {
          console.error("Zustell-Mail fehlgeschlagen (ignoriert):", error);
        }
      }
      granted.push({ orderId: order.id, coins });
    }
  }

  return granted;
}

export async function getUserBadges(userId: string) {
  const [orders, user] = await Promise.all([
    prisma.order.findMany({ where: { userId }, include: { items: { include: { product: { include: { category: true } } } } } }),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);

  const earned = new Set<string>();
  if (orders.length >= 1) earned.add("first-order");
  if (orders.length >= 10) earned.add("ten-orders");
  if (orders.some((o) => o.items.filter((i) => i.product?.category.slug === "beauty").length >= 3)) {
    earned.add("beauty-addict");
  }
  if (orders.some((o) => o.placedAt.getHours() >= 0 && o.placedAt.getHours() < 5)) {
    earned.add("night-owl");
  }
  if ((user?.streak ?? 0) >= 7) earned.add("streak-7");

  return BADGES.map((b) => ({ ...b, earned: earned.has(b.key) }));
}
