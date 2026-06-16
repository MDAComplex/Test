"use server";

import { prisma } from "@/lib/prisma";
import { auth, signIn } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { bumpQuest, setQuestProgressAbsolute, claimMysteryBox, getRank } from "@/lib/rewards";

async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session.user as { id: string; email: string; role: string };
}

async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  return user;
}

export async function registerUser(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const name = String(formData.get("name") || "").trim();
  const password = String(formData.get("password") || "");

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailValid || !password || password.length < 6) {
    throw new Error("Bitte gültige Email und ein Passwort mit mind. 6 Zeichen angeben.");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new Error("Es existiert bereits ein Account mit dieser Email.");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: { email, name, passwordHash, role: "USER", coins: 25, onboarded: false },
  });

  await signIn("credentials", { email, password, redirectTo: "/onboarding" });
}

export async function completeOnboarding(formData: FormData) {
  const user = await requireUser();
  const preferences = formData.getAll("preferences").map(String).join(",");
  const style = String(formData.get("style") || "");
  const budgetFeel = String(formData.get("budgetFeel") || "");

  await prisma.user.update({
    where: { id: user.id },
    data: { preferences, style, budgetFeel, onboarded: true },
  });

  revalidatePath("/");
  redirect("/");
}

export async function updateOwnName(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Bitte einen Namen angeben.");
  await prisma.user.update({ where: { id: user.id }, data: { name } });
  revalidatePath("/account");
}

export async function recordProductView() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return;
  await bumpQuest(userId, "browse5", 1);
}

export async function addToCart(productId: string, quantity = 1) {
  const user = await requireUser();
  const existing = await prisma.cartItem.findUnique({
    where: { userId_productId: { userId: user.id, productId } },
  });

  await prisma.cartItem.upsert({
    where: { userId_productId: { userId: user.id, productId } },
    update: { quantity: { increment: quantity } },
    create: { userId: user.id, productId, quantity },
  });

  if (!existing) {
    await bumpQuest(user.id, "cart3", 1);
  }

  const cartItems = await prisma.cartItem.findMany({ where: { userId: user.id }, include: { product: true } });
  const cartTotal = cartItems.reduce((s, i) => s + i.product.price * i.quantity, 0);
  await setQuestProgressAbsolute(user.id, "cart50", cartTotal);

  revalidatePath("/cart");
}

export async function updateCartQty(cartItemId: string, quantity: number) {
  const user = await requireUser();
  if (quantity <= 0) {
    await prisma.cartItem.deleteMany({ where: { id: cartItemId, userId: user.id } });
  } else {
    await prisma.cartItem.updateMany({
      where: { id: cartItemId, userId: user.id },
      data: { quantity },
    });
  }
  revalidatePath("/cart");
}

export async function removeFromCart(cartItemId: string) {
  const user = await requireUser();
  await prisma.cartItem.deleteMany({ where: { id: cartItemId, userId: user.id } });
  revalidatePath("/cart");
}

export async function checkout(formData: FormData) {
  const user = await requireUser();

  const shippingName = String(formData.get("shippingName") || "");
  const shippingAddress = String(formData.get("shippingAddress") || "");
  // Fiktive Zahlungsdaten: bewusst NICHT validiert oder gespeichert - es passiert nichts mit ihnen.

  const cartItems = await prisma.cartItem.findMany({
    where: { userId: user.id },
    include: { product: true },
  });

  if (cartItems.length === 0) {
    throw new Error("Warenkorb ist leer.");
  }

  const total = cartItems.reduce((sum, ci) => sum + ci.product.price * ci.quantity, 0);
  const currentUser = await prisma.user.findUnique({ where: { id: user.id } });

  const minDays = Math.max(...cartItems.map((ci) => ci.product.shippingMinDays));
  const maxDays = Math.max(...cartItems.map((ci) => ci.product.shippingMaxDays));
  const now = new Date();
  const estDeliveryMin = new Date(now.getTime() + minDays * 24 * 60 * 60 * 1000);
  const estDeliveryMax = new Date(now.getTime() + maxDays * 24 * 60 * 60 * 1000);

  const order = await prisma.order.create({
    data: {
      userId: user.id,
      total,
      shippingName,
      shippingAddress,
      estDeliveryMin,
      estDeliveryMax,
      status: "PLACED",
      items: {
        create: cartItems.map((ci) => ({
          productId: ci.productId,
          productName: ci.product.name,
          productImage: ci.product.image,
          quantity: ci.quantity,
          priceAtPurchase: ci.product.price,
        })),
      },
    },
  });

  const coinsEarned = Math.round(total * 0.1);
  const rankBefore = getRank(currentUser?.coins ?? 0).current;
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: { coins: { increment: coinsEarned }, totalSaved: { increment: total } },
  });
  const rankAfter = getRank(updatedUser.coins).current;

  await prisma.cartItem.deleteMany({ where: { userId: user.id } });

  const leveledUp = rankAfter.key !== rankBefore.key;
  redirect(`/orders/${order.id}${leveledUp ? `?levelup=${encodeURIComponent(rankAfter.label)}` : ""}`);
}

export async function updatePreferences(formData: FormData) {
  const user = await requireUser();
  const preferences = formData.getAll("preferences").map(String).join(",");
  await prisma.user.update({ where: { id: user.id }, data: { preferences } });
  revalidatePath("/");
}

export async function claimMysteryBoxAction() {
  const user = await requireUser();
  const prize = await claimMysteryBox(user.id);
  revalidatePath("/rewards");
  return prize;
}

async function imageFromFormData(formData: FormData, fallback: string) {
  const file = formData.get("imageFile") as File | null;
  if (file && file.size > 0) {
    const buffer = Buffer.from(await file.arrayBuffer());
    return `data:${file.type};base64,${buffer.toString("base64")}`;
  }
  const urlOrEmoji = String(formData.get("image") || "").trim();
  return urlOrEmoji || fallback;
}

// --- Admin actions ---

export async function createProduct(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") || "");
  const description = String(formData.get("description") || "");
  const price = parseFloat(String(formData.get("price") || "0"));
  const image = await imageFromFormData(formData, "📦");
  const categoryId = String(formData.get("categoryId") || "");
  const shippingMinDays = parseInt(String(formData.get("shippingMinDays") || "2"), 10);
  const shippingMaxDays = parseInt(String(formData.get("shippingMaxDays") || "5"), 10);
  const stock = parseInt(String(formData.get("stock") || "99"), 10);
  const affiliateUrl = String(formData.get("affiliateUrl") || "").trim() || null;

  if (!name || !categoryId || isNaN(price)) {
    throw new Error("Bitte alle Pflichtfelder ausfüllen.");
  }

  await prisma.product.create({
    data: { name, description, price, image, categoryId, shippingMinDays, shippingMaxDays, stock, affiliateUrl },
  });
  revalidatePath("/admin/products");
  revalidatePath("/");
}

export async function updateProduct(productId: string, formData: FormData) {
  await requireAdmin();
  const existing = await prisma.product.findUnique({ where: { id: productId } });
  const name = String(formData.get("name") || "");
  const description = String(formData.get("description") || "");
  const price = parseFloat(String(formData.get("price") || "0"));
  const image = await imageFromFormData(formData, existing?.image ?? "📦");
  const categoryId = String(formData.get("categoryId") || "");
  const shippingMinDays = parseInt(String(formData.get("shippingMinDays") || "2"), 10);
  const shippingMaxDays = parseInt(String(formData.get("shippingMaxDays") || "5"), 10);
  const stock = parseInt(String(formData.get("stock") || "99"), 10);
  const affiliateUrl = String(formData.get("affiliateUrl") || "").trim() || null;

  await prisma.product.update({
    where: { id: productId },
    data: { name, description, price, image, categoryId, shippingMinDays, shippingMaxDays, stock, affiliateUrl },
  });
  revalidatePath("/admin/products");
  revalidatePath("/");
}

export async function deleteProduct(productId: string) {
  await requireAdmin();
  await prisma.cartItem.deleteMany({ where: { productId } });
  await prisma.product.delete({ where: { id: productId } });
  revalidatePath("/admin/products");
  revalidatePath("/");
}

export async function deleteAllSampleProducts() {
  await requireAdmin();
  const sampleProducts = await prisma.product.findMany({ where: { isSample: true } });
  const ids = sampleProducts.map((p) => p.id);
  await prisma.cartItem.deleteMany({ where: { productId: { in: ids } } });
  await prisma.product.deleteMany({ where: { isSample: true } });
  revalidatePath("/admin/products");
  revalidatePath("/");
}

export async function updateAdSlot(slotId: string, formData: FormData) {
  await requireAdmin();
  const enabled = formData.get("enabled") === "on";
  const html = String(formData.get("html") || "");
  await prisma.adSlot.update({ where: { id: slotId }, data: { enabled, html } });
  revalidatePath("/admin/ads");
  revalidatePath("/");
}

export async function updateOrderStatus(orderId: string, status: string) {
  await requireAdmin();
  await prisma.order.update({ where: { id: orderId }, data: { status } });
  revalidatePath("/admin/orders");
}

export async function changeOwnPassword(formData: FormData) {
  const user = await requireUser();
  const currentPassword = String(formData.get("currentPassword") || "");
  const newPassword = String(formData.get("newPassword") || "");

  if (newPassword.length < 6) {
    throw new Error("Neues Passwort muss mind. 6 Zeichen haben.");
  }

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) throw new Error("Nutzer nicht gefunden.");

  const valid = await bcrypt.compare(currentPassword, dbUser.passwordHash);
  if (!valid) throw new Error("Aktuelles Passwort ist falsch.");

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
}
