"use server";

import { prisma } from "@/lib/prisma";
import { auth, signIn } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

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
  const preferences = formData.getAll("preferences").map(String).join(",");

  if (!email || !password || password.length < 6) {
    throw new Error("Bitte gültige Email und ein Passwort mit mind. 6 Zeichen angeben.");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new Error("Es existiert bereits ein Account mit dieser Email.");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: { email, name, passwordHash, preferences, role: "USER" },
  });

  await signIn("credentials", { email, password, redirectTo: "/" });
}

export async function addToCart(productId: string, quantity = 1) {
  const user = await requireUser();
  await prisma.cartItem.upsert({
    where: { userId_productId: { userId: user.id, productId } },
    update: { quantity: { increment: quantity } },
    create: { userId: user.id, productId, quantity },
  });
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
          quantity: ci.quantity,
          priceAtPurchase: ci.product.price,
        })),
      },
    },
  });

  await prisma.cartItem.deleteMany({ where: { userId: user.id } });

  redirect(`/orders/${order.id}`);
}

export async function updatePreferences(formData: FormData) {
  const user = await requireUser();
  const preferences = formData.getAll("preferences").map(String).join(",");
  await prisma.user.update({ where: { id: user.id }, data: { preferences } });
  revalidatePath("/");
}

// --- Admin actions ---

export async function createProduct(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") || "");
  const description = String(formData.get("description") || "");
  const price = parseFloat(String(formData.get("price") || "0"));
  const image = String(formData.get("image") || "📦");
  const categoryId = String(formData.get("categoryId") || "");
  const shippingMinDays = parseInt(String(formData.get("shippingMinDays") || "2"), 10);
  const shippingMaxDays = parseInt(String(formData.get("shippingMaxDays") || "5"), 10);
  const stock = parseInt(String(formData.get("stock") || "99"), 10);

  if (!name || !categoryId || isNaN(price)) {
    throw new Error("Bitte alle Pflichtfelder ausfüllen.");
  }

  await prisma.product.create({
    data: { name, description, price, image, categoryId, shippingMinDays, shippingMaxDays, stock },
  });
  revalidatePath("/admin/products");
  revalidatePath("/");
}

export async function updateProduct(productId: string, formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") || "");
  const description = String(formData.get("description") || "");
  const price = parseFloat(String(formData.get("price") || "0"));
  const image = String(formData.get("image") || "📦");
  const categoryId = String(formData.get("categoryId") || "");
  const shippingMinDays = parseInt(String(formData.get("shippingMinDays") || "2"), 10);
  const shippingMaxDays = parseInt(String(formData.get("shippingMaxDays") || "5"), 10);
  const stock = parseInt(String(formData.get("stock") || "99"), 10);

  await prisma.product.update({
    where: { id: productId },
    data: { name, description, price, image, categoryId, shippingMinDays, shippingMaxDays, stock },
  });
  revalidatePath("/admin/products");
  revalidatePath("/");
}

export async function deleteProduct(productId: string) {
  await requireAdmin();
  await prisma.cartItem.deleteMany({ where: { productId } });
  await prisma.orderItem.deleteMany({ where: { productId } });
  await prisma.product.delete({ where: { id: productId } });
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
