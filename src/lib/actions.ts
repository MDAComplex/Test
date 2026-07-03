"use server";

import { prisma } from "@/lib/prisma";
import { auth, signIn } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { bumpQuest, setQuestProgressAbsolute, getRank } from "@/lib/rewards";
import { effectivePrice } from "@/lib/pricing";
import { readGuestCart, writeGuestCart, clearGuestCart } from "@/lib/guestCart";
import { countryName, isValidCountry } from "@/lib/countries";
import { assertRateLimit } from "@/lib/rateLimit";
import { getShipmentProgress, isCancellable, getTrackingNumber } from "@/lib/shipping";
import { grantCoins, spendCoins } from "@/lib/coins";
import { getActiveDealsMap, dealUnitPrice } from "@/lib/deals";
import { storeFile } from "@/lib/storage";
import { sendShopEmail, shopEmailHtml } from "@/lib/email";
import { randomUUID } from "crypto";

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

  assertRateLimit(`register:${email}`, 5, 60 * 60 * 1000);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new Error("Es existiert bereits ein Account mit dieser Email.");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const newUser = await prisma.user.create({
    // Onboarding ist optional: direkt als onboarded markieren, Präferenzen später im Account anpassbar.
    data: { email, name, passwordHash, role: "USER", onboarded: true },
  });

  // Willkommensbonus (inkl. Eintrag im Coins-Verlauf).
  await grantCoins(newUser.id, 25, "Willkommensbonus");

  // Gast-Warenkorb in den frischen Account übernehmen (Cookie danach leer).
  await mergeGuestCart(newUser.id);

  await signIn("credentials", { email, password, redirectTo: "/" });
}

/**
 * Login-Server-Action: prüft Credentials (inkl. Blockierung + Rate-Limit),
 * merged davor den Gast-Warenkorb in den DB-Warenkorb und meldet dann via
 * NextAuth an. Wird von /login verwendet.
 */
export async function loginUser(formData: FormData, callbackUrl?: string) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  assertRateLimit(`login:${email}`, 10, 15 * 60 * 1000);

  // Credentials vorab prüfen, damit der Gast-Warenkorb nur bei gültigem
  // Login gemerged wird (signIn selbst wirft bei Erfolg einen Redirect).
  const user = await prisma.user.findUnique({ where: { email } });
  if (user && !user.blocked && (await bcrypt.compare(password, user.passwordHash))) {
    await mergeGuestCart(user.id);
  }

  await signIn("credentials", { email, password, redirectTo: callbackUrl || "/" });
}

/**
 * Überträgt den Gast-Warenkorb (Cookie) in den DB-Warenkorb des Nutzers und
 * leert das Cookie. Nur aus Server Actions aufrufbar (Cookie-Schreibzugriff).
 */
export async function mergeGuestCart(userId: string) {
  const guestItems = await readGuestCart();
  if (guestItems.length === 0) return;

  for (const item of guestItems) {
    const product = await prisma.product.findUnique({ where: { id: item.productId } });
    if (!product || product.stock <= 0) continue;
    const variant = item.variant ?? "";
    await prisma.cartItem.upsert({
      where: { userId_productId_variant: { userId, productId: item.productId, variant } },
      update: { quantity: { increment: item.quantity } },
      create: { userId, productId: item.productId, quantity: item.quantity, variant },
    });
  }

  await clearGuestCart();
  revalidatePath("/cart");
}

export async function completeOnboarding(formData: FormData) {
  const user = await requireUser();
  const preferences = formData.getAll("preferences").map(String).join(",");
  const style = String(formData.get("style") || "");
  const budgetFeel = String(formData.get("budgetFeel") || "");

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  const wasOnboarded = dbUser?.onboarded ?? false;

  await prisma.user.update({
    where: { id: user.id },
    data: { preferences, style, budgetFeel, onboarded: true },
  });

  revalidatePath("/");
  revalidatePath("/account");
  redirect(wasOnboarded ? "/account?ok=preferences" : "/");
}

export async function updateOwnName(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Bitte einen Namen angeben.");
  await prisma.user.update({ where: { id: user.id }, data: { name } });
  revalidatePath("/account");
}

export async function toggleWishlist(productId: string) {
  const user = await requireUser();
  const existing = await prisma.wishlist.findUnique({
    where: { userId_productId: { userId: user.id, productId } },
  });

  if (existing) {
    await prisma.wishlist.delete({ where: { id: existing.id } });
  } else {
    await prisma.wishlist.create({ data: { userId: user.id, productId } });
  }

  revalidatePath("/favoriten");
  revalidatePath(`/product/${productId}`);
}

export async function recordProductView() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return;
  await bumpQuest(userId, "browse5", 1);
}

export async function addToCart(productId: string, quantity = 1, variant = "") {
  const session = await auth();
  const user = session?.user as { id: string } | undefined;

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new Error("Produkt nicht gefunden.");
  if (product.stock <= 0) throw new Error("Dieser Artikel ist leider ausverkauft.");
  if (product.sizes.length > 0 && !variant) {
    // Größenpflichtig, aber ohne Auswahl geklickt (z. B. Karten-Button):
    // zur Produktseite mit Größenwahl statt Fehler.
    redirect(`/product/${productId}`);
  }

  // Gäste: Warenkorb im Cookie führen — kein Login-Zwang beim Shoppen.
  if (!user?.id) {
    const items = await readGuestCart();
    const existingItem = items.find((i) => i.productId === productId && (i.variant ?? "") === variant);
    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      items.push({ productId, quantity, ...(variant ? { variant } : {}) });
    }
    await writeGuestCart(items);
    revalidatePath("/cart");
    return;
  }

  // Sicherheitsnetz: evtl. noch vorhandenen Gast-Warenkorb übernehmen.
  await mergeGuestCart(user.id);

  const existing = await prisma.cartItem.findUnique({
    where: { userId_productId_variant: { userId: user.id, productId, variant } },
  });

  await prisma.cartItem.upsert({
    where: { userId_productId_variant: { userId: user.id, productId, variant } },
    update: { quantity: { increment: quantity }, savedForLater: false },
    create: { userId: user.id, productId, quantity, variant },
  });

  if (!existing) {
    await bumpQuest(user.id, "cart3", 1);
  }

  const cartItems = await prisma.cartItem.findMany({
    where: { userId: user.id, savedForLater: false },
    include: { product: true },
  });
  const cartTotal = cartItems.reduce((s, i) => s + effectivePrice(i.product) * i.quantity, 0);
  await setQuestProgressAbsolute(user.id, "cart50", cartTotal);

  revalidatePath("/cart");
}

/** Gast-Warenkorb: mutationId ist "productId::variant" (Variante optional). */
function parseGuestCartKey(key: string): { productId: string; variant: string } {
  const idx = key.indexOf("::");
  if (idx === -1) return { productId: key, variant: "" };
  return { productId: key.slice(0, idx), variant: key.slice(idx + 2) };
}

export async function updateCartQty(cartItemId: string, quantity: number) {
  const session = await auth();
  const user = session?.user as { id: string } | undefined;

  // Gäste: cartItemId ist hier "productId::variant" (Cookie-Warenkorb).
  if (!user?.id) {
    const { productId, variant } = parseGuestCartKey(cartItemId);
    const matches = (i: { productId: string; variant?: string }) =>
      i.productId === productId && (i.variant ?? "") === variant;
    const items = await readGuestCart();
    const next =
      quantity <= 0
        ? items.filter((i) => !matches(i))
        : items.map((i) => (matches(i) ? { ...i, quantity } : i));
    await writeGuestCart(next);
    revalidatePath("/cart");
    return;
  }

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
  const session = await auth();
  const user = session?.user as { id: string } | undefined;

  // Gäste: cartItemId ist hier "productId::variant" (Cookie-Warenkorb).
  if (!user?.id) {
    const { productId, variant } = parseGuestCartKey(cartItemId);
    const items = await readGuestCart();
    await writeGuestCart(items.filter((i) => !(i.productId === productId && (i.variant ?? "") === variant)));
    revalidatePath("/cart");
    return;
  }

  await prisma.cartItem.deleteMany({ where: { id: cartItemId, userId: user.id } });
  revalidatePath("/cart");
}

// --- Für später speichern (nur eingeloggte Nutzer) ---

export async function saveForLater(cartItemId: string) {
  const user = await requireUser();
  await prisma.cartItem.updateMany({
    where: { id: cartItemId, userId: user.id },
    data: { savedForLater: true },
  });
  revalidatePath("/cart");
}

export async function moveToCart(cartItemId: string) {
  const user = await requireUser();
  await prisma.cartItem.updateMany({
    where: { id: cartItemId, userId: user.id },
    data: { savedForLater: false },
  });
  revalidatePath("/cart");
}

/**
 * Validiert einen Gutscheincode serverseitig (existiert, aktiv, nicht abgelaufen).
 * Account-gebundene Gutscheine (restrictedToEmail) sind nur für den eingeloggten
 * Nutzer mit passender E-Mail gültig; die E-Mail wird aus der Session gelesen,
 * damit die Aufrufer-Schnittstelle (nur der Code) unverändert bleibt.
 */
export async function validateCoupon(code: string) {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return null;
  const coupon = await prisma.coupon.findUnique({ where: { code: trimmed } });
  if (!coupon || !coupon.active) return null;
  if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) return null;
  if (coupon.restrictedToEmail) {
    const session = await auth();
    const email = (session?.user as { email?: string } | undefined)?.email?.toLowerCase();
    if (!email || email !== coupon.restrictedToEmail.toLowerCase()) return null;
  }
  return coupon;
}

export async function checkout(formData: FormData) {
  const user = await requireUser();

  // Adresse: entweder eine gespeicherte Adresse (addressId) oder neue Felder.
  let shippingName = String(formData.get("shippingName") || "").trim();
  let street = String(formData.get("shippingStreet") || "").trim();
  let zip = String(formData.get("shippingZip") || "").trim();
  let city = String(formData.get("shippingCity") || "").trim();
  let country = String(formData.get("shippingCountry") || "CH").trim().toUpperCase();

  const addressId = String(formData.get("addressId") || "").trim();
  if (addressId && addressId !== "new") {
    const saved = await prisma.address.findUnique({ where: { id: addressId } });
    if (!saved || saved.userId !== user.id) throw new Error("Adresse nicht gefunden.");
    shippingName = saved.name;
    street = saved.street;
    zip = saved.zip;
    city = saved.city;
    country = saved.country;
  } else {
    if (!shippingName || !street || !zip || !city) {
      throw new Error("Bitte die Lieferadresse vollständig ausfüllen.");
    }
    if (!isValidCountry(country)) country = "CH";
    // Optional: neue Adresse im Adressbuch speichern.
    if (formData.get("saveAddress") === "on") {
      const count = await prisma.address.count({ where: { userId: user.id } });
      await prisma.address.create({
        data: { userId: user.id, name: shippingName, street, zip, city, country, isDefault: count === 0 },
      });
      revalidatePath("/account");
    }
  }

  const shippingAddress = `${street}\n${zip} ${city}\n${countryName(country)}`;
  // Fiktive Zahlungsdaten (Kartennummer, Ablaufdatum, CVC): bewusst NICHT validiert,
  // NICHT gespeichert und NICHT verarbeitet — es passiert nichts mit ihnen (Demo, CHF 0.00).

  // "Für später gespeicherte" Artikel bleiben im Warenkorb liegen und werden nicht bestellt.
  const cartItems = await prisma.cartItem.findMany({
    where: { userId: user.id, savedForLater: false },
    include: { product: true },
  });

  if (cartItems.length === 0) {
    throw new Error("Warenkorb ist leer.");
  }

  // Blitzangebote: Deal-Preis gilt, wenn das Restkontingent die Menge abdeckt.
  const dealsMap = await getActiveDealsMap(cartItems.map((ci) => ci.productId));
  const unitPrice = (ci: (typeof cartItems)[number]) =>
    dealUnitPrice(ci.product, dealsMap.get(ci.productId), ci.quantity);

  const subtotal = cartItems.reduce((sum, ci) => sum + unitPrice(ci) * ci.quantity, 0);

  // Gutschein serverseitig prüfen; ungültige Codes führen zurück zum Checkout mit Fehlermeldung.
  const couponInput = String(formData.get("couponCode") || "").trim();
  let couponCode: string | null = null;
  let discountAmount = 0;
  if (couponInput) {
    const coupon = await validateCoupon(couponInput);
    if (!coupon) redirect("/checkout?coupon=invalid");
    couponCode = coupon.code;
    discountAmount = Math.round(subtotal * (coupon.percent / 100) * 100) / 100;
  }

  const currentUser = await prisma.user.findUnique({ where: { id: user.id } });

  // Coins einlösen: 100 Coins = 1 €. Serverseitig auf Guthaben und
  // Zwischensumme (nach Gutschein) begrenzt — nie unter 0 €.
  const afterCoupon = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);
  const requestedCoins = Math.max(0, parseInt(String(formData.get("redeemCoins") || "0"), 10) || 0);
  const maxByBalance = currentUser?.coins ?? 0;
  const maxByTotal = Math.floor(afterCoupon * 100);
  let coinsRedeemed = Math.min(requestedCoins, maxByBalance, maxByTotal);
  if (coinsRedeemed < 100) coinsRedeemed = 0; // Einlösen erst ab 100 Coins
  const coinsDiscount = Math.round(coinsRedeemed) / 100;

  const total = Math.max(0, Math.round((afterCoupon - coinsDiscount) * 100) / 100);

  const minDays = Math.max(...cartItems.map((ci) => ci.product.shippingMinDays));
  const maxDays = Math.max(...cartItems.map((ci) => ci.product.shippingMaxDays));
  const now = new Date();
  const estDeliveryMin = new Date(now.getTime() + minDays * 24 * 60 * 60 * 1000);
  const estDeliveryMax = new Date(now.getTime() + maxDays * 24 * 60 * 60 * 1000);

  const order = await prisma.order.create({
    data: {
      userId: user.id,
      total,
      couponCode,
      discountAmount,
      coinsRedeemed,
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
          variant: ci.variant,
          priceAtPurchase: unitPrice(ci),
        })),
      },
    },
  });

  // Lagerbestand reduzieren (nie unter 0).
  for (const ci of cartItems) {
    await prisma.product.update({
      where: { id: ci.productId },
      data: { stock: Math.max(0, ci.product.stock - ci.quantity) },
    });
  }

  // Deal-Kontingent verbrauchen (sold erhöhen, nie über quantity).
  for (const ci of cartItems) {
    const deal = dealsMap.get(ci.productId);
    if (!deal) continue;
    const remaining = deal.quantity - deal.sold;
    if (remaining <= 0) continue;
    await prisma.deal.update({
      where: { id: deal.id },
      data: { sold: { increment: Math.min(ci.quantity, remaining) } },
    });
  }

  // Kleiner Bestellbonus sofort — der große Coin-Payout ("Lieferbonus") kommt erst
  // bei Zustellung via grantDeliveryRewards (macht den Loop spannender).
  const coinsEarned = 10;
  const shortId = order.id.slice(-6).toUpperCase();
  const rankBefore = getRank(currentUser?.coins ?? 0).current;
  // Eingelöste Coins abziehen, Bestellbonus gutschreiben (je mit Verlaufs-Eintrag).
  if (coinsRedeemed > 0) {
    await spendCoins(user.id, coinsRedeemed, "Coins eingelöst");
  }
  const coinsAfter = await grantCoins(user.id, coinsEarned, "Bestellbonus");
  await prisma.user.update({
    where: { id: user.id },
    data: { totalSaved: { increment: total } },
  });
  const rankAfter = getRank(coinsAfter).current;

  await prisma.cartItem.deleteMany({ where: { userId: user.id, savedForLater: false } });

  // Bestellbestätigung als Benachrichtigung (simulierte E-Mail; echter Versand kommt später).
  const itemCount = cartItems.reduce((s, ci) => s + ci.quantity, 0);
  const discountParts = [
    discountAmount > 0 ? `Gutschein ${couponCode}: −${discountAmount.toFixed(2)} €` : "",
    coinsRedeemed > 0 ? `Coins-Rabatt: −${coinsDiscount.toFixed(2)} € (${coinsRedeemed} Coins)` : "",
  ].filter(Boolean);
  await prisma.notification.create({
    data: {
      userId: user.id,
      title: `Bestellbestätigung #${shortId}`,
      body:
        `Danke für deine Bestellung! ${itemCount} Artikel, Warenwert ${total.toFixed(2)} €.` +
        (discountParts.length > 0 ? ` ${discountParts.join(" · ")}.` : "") +
        ` Sendungsnummer: ${getTrackingNumber(order.id)}.` +
        ` Voraussichtliche Zustellung: ${estDeliveryMin.toLocaleDateString("de-DE")} – ${estDeliveryMax.toLocaleDateString("de-DE")}. (Ref: ${order.id})`,
    },
  });

  // Echte E-Mail (nur wenn RESEND_API_KEY gesetzt ist; sonst No-op).
  await sendShopEmail(
    user.email,
    `Bestellbestätigung #${shortId} – Viralo.shop`,
    shopEmailHtml(
      `Bestellbestätigung #${shortId}`,
      `Danke für deine Bestellung! ${itemCount} Artikel, Warenwert ${total.toFixed(2)} €.` +
        (discountParts.length > 0 ? ` ${discountParts.join(" · ")}.` : "") +
        ` Sendungsnummer: ${getTrackingNumber(order.id)}. Voraussichtliche Zustellung: ${estDeliveryMin.toLocaleDateString("de-DE")} – ${estDeliveryMax.toLocaleDateString("de-DE")}.`
    )
  );

  const leveledUp = rankAfter.key !== rankBefore.key;
  redirect(`/orders/${order.id}${leveledUp ? `?levelup=${encodeURIComponent(rankAfter.label)}` : ""}`);
}

export async function markAllNotificationsRead() {
  const user = await requireUser();
  await prisma.notification.updateMany({ where: { userId: user.id, read: false }, data: { read: true } });
  revalidatePath("/notifications");
}

export async function updatePreferences(formData: FormData) {
  const user = await requireUser();
  const preferences = formData.getAll("preferences").map(String).join(",");
  await prisma.user.update({ where: { id: user.id }, data: { preferences } });
  revalidatePath("/");
}

const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB pro Bild
const MAX_VIDEO_BYTES = 20 * 1024 * 1024; // 20 MB pro Video

async function imageFromFormData(formData: FormData, fallback: string) {
  const file = formData.get("imageFile") as File | null;
  if (file && file.size > 0) {
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error("Das Hauptbild ist zu groß (max. 4 MB pro Bild).");
    }
    return storeFile(file, "products");
  }
  const urlOrEmoji = String(formData.get("image") || "").trim();
  return urlOrEmoji || fallback;
}

/** Liest neue Galerie-Bilder ("galleryFiles") als Data-URIs, mit Größenlimit. */
async function galleryFromFormData(formData: FormData): Promise<string[]> {
  const files = (formData.getAll("galleryFiles") as File[]).filter((f) => f && f.size > 0);
  const uris: string[] = [];
  for (const file of files) {
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error(`Galerie-Bild "${file.name}" ist zu groß (max. 4 MB pro Bild).`);
    }
    uris.push(await storeFile(file, "products"));
  }
  return uris;
}

/** Liest ein neues Video ("videoFile") als Data-URI, mit Größenlimit. */
async function videoFromFormData(formData: FormData): Promise<string | null> {
  const file = formData.get("videoFile") as File | null;
  if (!file || file.size === 0) return null;
  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error("Das Video ist zu groß (max. 20 MB).");
  }
  return storeFile(file, "videos");
}

/** Gemeinsame validierte Felder für create/update von Produkten. */
function productFieldsFromFormData(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const price = parseFloat(String(formData.get("price") || "0"));
  const categoryId = String(formData.get("categoryId") || "").trim();
  const discountPercent = Math.min(90, Math.max(0, parseInt(String(formData.get("discountPercent") || "0"), 10) || 0));
  const shippingMinDays = Math.max(0, parseInt(String(formData.get("shippingMinDays") || "2"), 10) || 2);
  const shippingMaxDaysRaw = Math.max(0, parseInt(String(formData.get("shippingMaxDays") || "5"), 10) || 5);
  const shippingMaxDays = Math.max(shippingMinDays, shippingMaxDaysRaw);
  const stock = Math.max(0, parseInt(String(formData.get("stock") || "99"), 10) || 0);
  const affiliateUrl = String(formData.get("affiliateUrl") || "").trim() || null;

  if (!name || !categoryId || isNaN(price) || price <= 0) {
    throw new Error("Bitte alle Pflichtfelder ausfüllen (Name, Kategorie, Preis > 0).");
  }

  return { name, description, price, categoryId, discountPercent, shippingMinDays, shippingMaxDays, stock, affiliateUrl };
}

// --- Admin actions ---

export async function createProduct(formData: FormData) {
  await requireAdmin();
  const fields = productFieldsFromFormData(formData);
  const image = await imageFromFormData(formData, "📦");
  const images = await galleryFromFormData(formData);
  const videoUrl = await videoFromFormData(formData);

  await prisma.product.create({
    data: { ...fields, image, images, videoUrl },
  });
  revalidatePath("/admin/products");
  revalidatePath("/");
  redirect("/admin/products?ok=created");
}

export async function updateProduct(productId: string, formData: FormData) {
  await requireAdmin();
  const existing = await prisma.product.findUnique({ where: { id: productId } });
  if (!existing) throw new Error("Produkt nicht gefunden.");

  const fields = productFieldsFromFormData(formData);
  const image = await imageFromFormData(formData, existing.image);

  // Galerie: bestehende Bilder minus entfernte plus neu hochgeladene.
  const removeIndexes = new Set(
    formData.getAll("removeGalleryIndex").map((v) => parseInt(String(v), 10)).filter((n) => !isNaN(n))
  );
  const keptImages = existing.images.filter((_, i) => !removeIndexes.has(i));
  const newImages = await galleryFromFormData(formData);
  const images = [...keptImages, ...newImages];

  // Video: entfernen, ersetzen oder behalten.
  const removeVideo = formData.get("removeVideo") === "on";
  const newVideo = await videoFromFormData(formData);
  const videoUrl = newVideo ?? (removeVideo ? null : existing.videoUrl);

  await prisma.product.update({
    where: { id: productId },
    data: { ...fields, image, images, videoUrl },
  });
  revalidatePath("/admin/products");
  revalidatePath(`/product/${productId}`);
  revalidatePath("/");
  redirect("/admin/products?ok=updated");
}

/** Importiert Produkte aus einer hochgeladenen JSON-Datei (Array von Produkten). */
export async function importProducts(formData: FormData) {
  await requireAdmin();
  const file = formData.get("importFile") as File | null;
  if (!file || file.size === 0) throw new Error("Bitte eine JSON-Datei auswählen.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(await file.arrayBuffer()).toString("utf-8"));
  } catch {
    throw new Error("Die Datei enthält kein gültiges JSON.");
  }
  if (!Array.isArray(parsed)) throw new Error("Erwartet wird ein JSON-Array von Produkten.");

  const categories = await prisma.category.findMany();
  const bySlug = new Map(categories.map((c) => [c.slug, c.id]));

  let imported = 0;
  let skipped = 0;
  for (const raw of parsed) {
    const entry = raw as Record<string, unknown>;
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    const price = typeof entry.price === "number" ? entry.price : parseFloat(String(entry.price ?? ""));
    const categoryId =
      (typeof entry.categorySlug === "string" && bySlug.get(entry.categorySlug)) ||
      (typeof entry.categoryId === "string" && categories.some((c) => c.id === entry.categoryId) ? (entry.categoryId as string) : null);

    if (!name || isNaN(price) || price <= 0 || !categoryId) {
      skipped++;
      continue;
    }

    await prisma.product.create({
      data: {
        name,
        description: typeof entry.description === "string" ? entry.description : "",
        price,
        image: typeof entry.image === "string" && entry.image ? entry.image : "📦",
        images: Array.isArray(entry.images) ? entry.images.filter((i): i is string => typeof i === "string") : [],
        videoUrl: typeof entry.videoUrl === "string" && entry.videoUrl ? entry.videoUrl : null,
        discountPercent: Math.min(90, Math.max(0, parseInt(String(entry.discountPercent ?? 0), 10) || 0)),
        categoryId,
        shippingMinDays: Math.max(0, parseInt(String(entry.shippingMinDays ?? 2), 10) || 2),
        shippingMaxDays: Math.max(0, parseInt(String(entry.shippingMaxDays ?? 5), 10) || 5),
        stock: Math.max(0, parseInt(String(entry.stock ?? 99), 10) || 0),
        affiliateUrl: typeof entry.affiliateUrl === "string" && entry.affiliateUrl ? entry.affiliateUrl : null,
      },
    });
    imported++;
  }

  revalidatePath("/admin/products");
  revalidatePath("/");
  redirect(`/admin/products?imported=${imported}${skipped ? `&skipped=${skipped}` : ""}`);
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

// --- Gutscheine & Rabatte ---

export async function createCoupon(formData: FormData) {
  await requireAdmin();
  const code = String(formData.get("code") || "").trim().toUpperCase();
  const percent = parseInt(String(formData.get("percent") || "0"), 10);
  const expiresRaw = String(formData.get("expiresAt") || "").trim();
  const restrictedToEmail = String(formData.get("restrictedToEmail") || "").trim().toLowerCase() || null;

  if (!code || !/^[A-Z0-9_-]{2,32}$/.test(code)) {
    throw new Error("Bitte einen gültigen Code angeben (2-32 Zeichen, Buchstaben/Zahlen).");
  }
  if (isNaN(percent) || percent < 1 || percent > 90) {
    throw new Error("Rabatt muss zwischen 1 und 90 Prozent liegen.");
  }
  if (restrictedToEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(restrictedToEmail)) {
    throw new Error("Bitte eine gültige E-Mail-Adresse für die Beschränkung angeben.");
  }
  const expiresAt = expiresRaw ? new Date(expiresRaw) : null;
  if (expiresAt && isNaN(expiresAt.getTime())) {
    throw new Error("Ungültiges Ablaufdatum.");
  }

  const existing = await prisma.coupon.findUnique({ where: { code } });
  if (existing) throw new Error("Ein Gutschein mit diesem Code existiert bereits.");

  await prisma.coupon.create({ data: { code, percent, expiresAt, active: true, restrictedToEmail } });
  revalidatePath("/admin/coupons");
}

export async function toggleCoupon(couponId: string) {
  await requireAdmin();
  const coupon = await prisma.coupon.findUnique({ where: { id: couponId } });
  if (!coupon) throw new Error("Gutschein nicht gefunden.");
  await prisma.coupon.update({ where: { id: couponId }, data: { active: !coupon.active } });
  revalidatePath("/admin/coupons");
}

export async function deleteCoupon(couponId: string) {
  await requireAdmin();
  await prisma.coupon.delete({ where: { id: couponId } });
  revalidatePath("/admin/coupons");
}

/** Setzt discountPercent für alle Produkte einer Kategorie (Rabattaktion). */
export async function applyCategoryDiscount(formData: FormData) {
  await requireAdmin();
  const categoryId = String(formData.get("categoryId") || "").trim();
  const percent = Math.min(90, Math.max(0, parseInt(String(formData.get("percent") || "0"), 10) || 0));
  if (!categoryId) throw new Error("Bitte eine Kategorie wählen.");

  await prisma.product.updateMany({ where: { categoryId }, data: { discountPercent: percent } });
  revalidatePath("/admin/coupons");
  revalidatePath("/admin/products");
  revalidatePath("/");
}

export async function resetAllDiscounts() {
  await requireAdmin();
  await prisma.product.updateMany({ data: { discountPercent: 0 } });
  revalidatePath("/admin/coupons");
  revalidatePath("/admin/products");
  revalidatePath("/");
}

// --- Werbung ---

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function updateAdSlot(slotId: string, formData: FormData) {
  await requireAdmin();
  const enabled = formData.get("enabled") === "on";
  const mode = String(formData.get("mode") || "html");

  let html = String(formData.get("html") || "");

  if (mode === "simple") {
    // Einfacher Modus: Banner-HTML serverseitig aus Feldern generieren.
    const targetUrl = String(formData.get("targetUrl") || "").trim();
    const title = String(formData.get("title") || "").trim();
    let imageSrc = String(formData.get("imageUrl") || "").trim();

    const file = formData.get("adImageFile") as File | null;
    if (file && file.size > 0) {
      if (file.size > MAX_IMAGE_BYTES) {
        throw new Error("Das Werbebild ist zu groß (max. 4 MB).");
      }
      imageSrc = await storeFile(file, "ads");
    }

    if (!imageSrc && !title) {
      throw new Error("Bitte im einfachen Modus mindestens ein Bild oder einen Titeltext angeben.");
    }

    const inner = [
      imageSrc
        ? `<img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(title)}" style="width:100%;border-radius:12px;display:block;" />`
        : "",
      title
        ? `<div style="padding:10px 4px;font-weight:600;color:#1c1c1f;font-size:15px;">${escapeHtml(title)}</div>`
        : "",
    ].join("");

    html = targetUrl
      ? `<a href="${escapeHtml(targetUrl)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;display:block;">${inner}</a>`
      : `<div>${inner}</div>`;
  }

  await prisma.adSlot.update({ where: { id: slotId }, data: { enabled, html } });
  revalidatePath("/admin/ads");
  revalidatePath("/");
}

const ORDER_STATUSES = ["PLACED", "PACKED", "SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"];

export async function updateOrderStatus(orderId: string, status: string) {
  await requireAdmin();
  if (!ORDER_STATUSES.includes(status)) throw new Error("Ungültiger Status.");
  await prisma.order.update({ where: { id: orderId }, data: { status } });
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
}

// --- Nutzerverwaltung (Admin) ---

/** Passt das Coin-Guthaben eines Nutzers um ein Delta an (nie unter 0). */
export async function adjustUserCoins(userId: string, formData: FormData) {
  await requireAdmin();
  const delta = parseInt(String(formData.get("delta") || "0"), 10);
  if (isNaN(delta) || delta === 0) throw new Error("Bitte eine Coin-Änderung ungleich 0 angeben.");

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new Error("Nutzer nicht gefunden.");

  if (delta > 0) {
    await grantCoins(userId, delta, "Anpassung durch Shop-Team");
  } else {
    await spendCoins(userId, -delta, "Anpassung durch Shop-Team");
  }
  revalidatePath("/admin/users");
}

/** Blockiert/entsperrt einen Nutzer. Sich selbst und andere Admins nicht blockierbar. */
export async function toggleUserBlocked(userId: string) {
  const admin = await requireAdmin();
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new Error("Nutzer nicht gefunden.");
  if (!target.blocked) {
    if (target.id === admin.id) throw new Error("Du kannst dich nicht selbst blockieren.");
    if (target.role === "ADMIN") throw new Error("Admins können nicht blockiert werden.");
  }
  await prisma.user.update({ where: { id: userId }, data: { blocked: !target.blocked } });
  revalidatePath("/admin/users");
}

/** Setzt die Rolle eines Nutzers (USER/ADMIN). Eigene Admin-Rolle nicht entziehbar. */
export async function setUserRole(userId: string, role: string) {
  const admin = await requireAdmin();
  if (role !== "USER" && role !== "ADMIN") throw new Error("Ungültige Rolle.");
  if (userId === admin.id && role !== "ADMIN") {
    throw new Error("Du kannst dir nicht selbst die Admin-Rolle entziehen.");
  }
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new Error("Nutzer nicht gefunden.");
  await prisma.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/admin/users");
}

// --- Kategorien (Admin) ---

/** Erzeugt aus einem Namen einen URL-tauglichen Slug (Umlaute inkl.). */
function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createCategory(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") || "").trim();
  const emoji = String(formData.get("emoji") || "").trim();
  if (!name) throw new Error("Bitte einen Kategorienamen angeben.");

  let slug = slugify(name);
  if (!slug) throw new Error("Aus diesem Namen lässt sich kein gültiger Slug erzeugen.");
  // Slug eindeutig machen, falls schon vergeben.
  if (await prisma.category.findUnique({ where: { slug } })) {
    let i = 2;
    while (await prisma.category.findUnique({ where: { slug: `${slug}-${i}` } })) i++;
    slug = `${slug}-${i}`;
  }

  await prisma.category.create({ data: { name, slug, ...(emoji ? { emoji } : {}) } });
  revalidatePath("/admin/categories");
  revalidatePath("/kategorien");
}

export async function renameCategory(categoryId: string, formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Bitte einen Namen angeben.");
  await prisma.category.update({ where: { id: categoryId }, data: { name } });
  revalidatePath("/admin/categories");
  revalidatePath("/kategorien");
}

export async function deleteCategory(categoryId: string) {
  await requireAdmin();
  const count = await prisma.product.count({ where: { categoryId } });
  if (count > 0) throw new Error("Kategorie enthält noch Produkte und kann nicht gelöscht werden.");
  await prisma.category.delete({ where: { id: categoryId } });
  revalidatePath("/admin/categories");
  revalidatePath("/kategorien");
}

// --- Bewertungs-Moderation (Admin) ---

export async function deleteReview(reviewId: string) {
  await requireAdmin();
  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review) return;
  await prisma.review.delete({ where: { id: reviewId } });
  revalidatePath("/admin/reviews");
  revalidatePath(`/product/${review.productId}`);
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

// --- Bewertungen (nur nach Zustellung) ---

/** Prüft, ob der Nutzer das Produkt aus einer zugestellten Bestellung hat. */
export async function hasDeliveredProduct(userId: string, productId: string): Promise<boolean> {
  const orders = await prisma.order.findMany({
    where: { userId, items: { some: { productId } } },
  });
  return orders.some((o) => getShipmentProgress(o).currentStatus === "DELIVERED");
}

export async function submitReview(productId: string, formData: FormData) {
  const user = await requireUser();
  assertRateLimit(`review:${user.id}`, 10, 60 * 60 * 1000);

  const rating = Math.min(5, Math.max(1, parseInt(String(formData.get("rating") || "0"), 10) || 0));
  const text = String(formData.get("text") || "").trim();
  if (!rating || !text) throw new Error("Bitte Sternebewertung und Text angeben.");

  // Nur verifizierte Käufe: Produkt muss aus einer zugestellten Bestellung stammen.
  const delivered = await hasDeliveredProduct(user.id, productId);
  if (!delivered) throw new Error("Du kannst nur Produkte bewerten, die dir bereits zugestellt wurden.");

  const existing = await prisma.review.findFirst({ where: { userId: user.id, productId } });
  if (existing) throw new Error("Du hast dieses Produkt bereits bewertet.");

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  const authorName = dbUser?.name || user.email.split("@")[0];

  // Bis zu 3 Fotos (max. 2 MB je Foto) als Data-URIs speichern.
  const photoFiles = (formData.getAll("photos") as File[]).filter((f) => f && f.size > 0).slice(0, 3);
  const images: string[] = [];
  for (const file of photoFiles) {
    if (file.size > 2 * 1024 * 1024) {
      throw new Error(`Foto "${file.name}" ist zu groß (max. 2 MB pro Foto).`);
    }
    images.push(await storeFile(file, "reviews"));
  }

  await prisma.review.create({
    data: { productId, userId: user.id, authorName, rating, text: text.slice(0, 2000), verified: true, images },
  });

  // Belohnung: +15 Coins pro Bewertung.
  await grantCoins(user.id, 15, "Bewertung verfasst");
  await prisma.notification.create({
    data: {
      userId: user.id,
      title: "Danke für deine Bewertung",
      body: "Deine Produktbewertung wurde veröffentlicht. +15 Coins wurden gutgeschrieben.",
    },
  });

  revalidatePath(`/product/${productId}`);
  revalidatePath("/orders");
}

// --- Stornieren & erneut bestellen ---

export async function cancelOrder(orderId: string) {
  const user = await requireUser();
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order || order.userId !== user.id) throw new Error("Bestellung nicht gefunden.");
  if (order.status === "CANCELLED") return;

  const { currentStatus } = getShipmentProgress(order);
  if (!isCancellable(currentStatus)) {
    throw new Error("Diese Bestellung wurde bereits an die Post übergeben und kann nicht mehr storniert werden.");
  }

  await prisma.order.update({ where: { id: orderId }, data: { status: "CANCELLED" } });

  // Lagerbestand wiederherstellen.
  for (const item of order.items) {
    if (!item.productId) continue;
    await prisma.product
      .update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } })
      .catch(() => {});
  }

  // Eingelöste Coins zurückerstatten, 10-Coins-Bestellbonus zurücknehmen.
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (order.coinsRedeemed > 0) {
    await grantCoins(user.id, order.coinsRedeemed, "Storno-Rückerstattung");
  }
  await spendCoins(user.id, 10, "Storno Bestellbonus");
  await prisma.user.update({
    where: { id: user.id },
    data: {
      totalSaved: { decrement: Math.min(order.total, dbUser?.totalSaved ?? 0) },
    },
  });

  await prisma.notification.create({
    data: {
      userId: user.id,
      title: "Bestellung storniert",
      body: `Deine Bestellung #${order.id.slice(-6).toUpperCase()} wurde storniert.${
        order.coinsRedeemed > 0 ? ` ${order.coinsRedeemed} eingelöste Coins wurden zurückerstattet.` : ""
      } (Ref: ${order.id})`,
    },
  });

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
}

/** Legt alle (noch existierenden) Artikel einer Bestellung erneut in den Warenkorb. */
export async function reorder(orderId: string) {
  const user = await requireUser();
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order || order.userId !== user.id) throw new Error("Bestellung nicht gefunden.");

  for (const item of order.items) {
    if (!item.productId) continue;
    const product = await prisma.product.findUnique({ where: { id: item.productId } });
    if (!product || product.stock <= 0) continue;
    const qty = Math.min(item.quantity, product.stock);
    await prisma.cartItem.upsert({
      where: {
        userId_productId_variant: { userId: user.id, productId: item.productId, variant: item.variant },
      },
      update: { quantity: { increment: qty }, savedForLater: false },
      create: { userId: user.id, productId: item.productId, quantity: qty, variant: item.variant },
    });
  }

  revalidatePath("/cart");
  redirect("/cart");
}

// --- Rücksendungen (simuliert) ---

const RETURN_REASONS = ["Passt nicht", "Gefällt nicht", "Defekt", "Falscher Artikel", "Sonstiges"];

/**
 * Meldet eine Rücksendung für eine zugestellte Bestellung an (Demo: keine echte
 * Rücksendung nötig). Zieht den Lieferbonus wieder ab und setzt den Status auf RETURNED.
 */
export async function requestReturn(orderId: string, formData: FormData) {
  const user = await requireUser();
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== user.id) throw new Error("Bestellung nicht gefunden.");

  const reason = String(formData.get("reason") || "").trim();
  if (!RETURN_REASONS.includes(reason)) throw new Error("Bitte einen Rücksendegrund auswählen.");

  const { currentStatus } = getShipmentProgress(order);
  if (currentStatus !== "DELIVERED") {
    throw new Error("Nur zugestellte Bestellungen können zurückgesendet werden.");
  }

  const existing = await prisma.returnRequest.findFirst({ where: { orderId } });
  if (existing) throw new Error("Für diese Bestellung wurde bereits eine Rücksendung angemeldet.");

  const shortId = order.id.slice(-6).toUpperCase();

  await prisma.returnRequest.create({
    data: { orderId, userId: user.id, reason },
  });
  await prisma.order.update({ where: { id: orderId }, data: { status: "RETURNED" } });

  // Lieferbonus wieder abziehen (nie unter 0), falls er gutgeschrieben wurde.
  if (order.rewardGranted) {
    const deliveryBonus = Math.max(5, Math.round(order.total * 0.1));
    await spendCoins(user.id, deliveryBonus, `Rücksendung Bestellung #${shortId}`);
  }

  await prisma.notification.create({
    data: {
      userId: user.id,
      title: "Rücksendung angemeldet",
      body: `Deine Rücksendung für Bestellung #${shortId} wurde angemeldet. Rückschein-Code: RET-${getTrackingNumber(order.id)}. Grund: ${reason}. Demo: keine echte Rücksendung nötig. (Ref: ${order.id})`,
    },
  });

  await sendShopEmail(
    user.email,
    `Rücksendung angemeldet #${shortId} – Viralo.shop`,
    shopEmailHtml(
      "Rücksendung angemeldet",
      `Deine Rücksendung für Bestellung #${shortId} wurde angemeldet. Rückschein-Code: RET-${getTrackingNumber(order.id)}. Grund: ${reason}. Demo: keine echte Rücksendung nötig.`
    )
  );

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
}

// --- Adressbuch ---

export async function addAddress(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") || "").trim();
  const street = String(formData.get("street") || "").trim();
  const zip = String(formData.get("zip") || "").trim();
  const city = String(formData.get("city") || "").trim();
  let country = String(formData.get("country") || "CH").trim().toUpperCase();
  if (!isValidCountry(country)) country = "CH";

  if (!name || !street || !zip || !city) throw new Error("Bitte alle Adressfelder ausfüllen.");

  const count = await prisma.address.count({ where: { userId: user.id } });
  await prisma.address.create({
    data: { userId: user.id, name, street, zip, city, country, isDefault: count === 0 },
  });
  revalidatePath("/account");
  revalidatePath("/checkout");
}

export async function deleteAddress(addressId: string) {
  const user = await requireUser();
  await prisma.address.deleteMany({ where: { id: addressId, userId: user.id } });
  revalidatePath("/account");
  revalidatePath("/checkout");
}

export async function setDefaultAddress(addressId: string) {
  const user = await requireUser();
  const address = await prisma.address.findUnique({ where: { id: addressId } });
  if (!address || address.userId !== user.id) throw new Error("Adresse nicht gefunden.");
  await prisma.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
  await prisma.address.update({ where: { id: addressId }, data: { isDefault: true } });
  revalidatePath("/account");
  revalidatePath("/checkout");
}

// --- Passwort zurücksetzen (simuliert, ohne echten E-Mail-Versand) ---

export async function requestPasswordReset(email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  assertRateLimit(`pwreset:${normalized}`, 3, 15 * 60 * 1000);

  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) return null;

  const token = randomUUID();
  await prisma.passwordResetToken.create({
    data: { email: normalized, token, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });
  // Demo: kein echter Mail-Versand — der Link wird direkt auf der Seite angezeigt.
  return token;
}

export async function resetPassword(formData: FormData) {
  const token = String(formData.get("token") || "").trim();
  const password = String(formData.get("password") || "");
  if (!token) throw new Error("Ungültiger Link.");
  if (password.length < 6) throw new Error("Passwort muss mind. 6 Zeichen haben.");

  const record = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!record || record.expiresAt.getTime() < Date.now()) {
    throw new Error("Dieser Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an.");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({ where: { email: record.email }, data: { passwordHash } });
  await prisma.passwordResetToken.deleteMany({ where: { email: record.email } });

  redirect("/login?reset=ok");
}

// --- Zuletzt angesehen ---

/** Merkt sich ein angesehenes Produkt (für die "Zuletzt angesehen"-Sektion). */
export async function trackRecentlyViewed(userId: string, productId: string) {
  await prisma.recentlyViewed
    .upsert({
      where: { userId_productId: { userId, productId } },
      update: { viewedAt: new Date() },
      create: { userId, productId },
    })
    .catch(() => {}); // z.B. wenn das Produkt gerade gelöscht wurde
}

// --- Glücksrad (täglich ein Gratis-Dreh) ---

// Segment-Reihenfolge muss zu SEGMENTS in components/LuckyWheel.tsx passen.
const WHEEL_PRIZES = [5, 10, 15, 20, 25, 50, 0, 100]; // 0 = Niete
const WHEEL_WEIGHTS = [25, 20, 15, 12, 10, 8, 8, 2];

/** Prüft, ob der Nutzer heute schon am Glücksrad gedreht hat (Kalendertag, wie Mystery Box). */
export async function hasSpunWheelToday(userId: string): Promise<boolean> {
  const dbUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!dbUser?.lastWheelSpinAt) return false;
  return dbUser.lastWheelSpinAt.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
}

/**
 * Dreht das Glücksrad: einmal pro Kalendertag, Gewinn wird serverseitig
 * gewichtet ausgewürfelt und via grantCoins gutgeschrieben.
 */
export async function spinWheel(): Promise<{ prize: number; segmentIndex: number }> {
  const user = await requireUser();

  if (await hasSpunWheelToday(user.id)) {
    throw new Error("Du hast heute schon gedreht — komm morgen wieder!");
  }

  const totalWeight = WHEEL_WEIGHTS.reduce((a, b) => a + b, 0);
  let roll = Math.random() * totalWeight;
  let segmentIndex = 0;
  for (let i = 0; i < WHEEL_PRIZES.length; i++) {
    if (roll < WHEEL_WEIGHTS[i]) {
      segmentIndex = i;
      break;
    }
    roll -= WHEEL_WEIGHTS[i];
  }
  const prize = WHEEL_PRIZES[segmentIndex];

  await prisma.user.update({
    where: { id: user.id },
    data: { lastWheelSpinAt: new Date() },
  });
  if (prize > 0) {
    await grantCoins(user.id, prize, "Glücksrad");
  }

  revalidatePath("/rewards");
  return { prize, segmentIndex };
}

// --- "Hilfreich"-Votes für Bewertungen ---

/** Markiert eine Bewertung als hilfreich — max. eine Stimme pro Nutzer und Bewertung. */
export async function markReviewHelpful(reviewId: string) {
  const user = await requireUser();
  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review) return;

  const existing = await prisma.reviewVote.findUnique({
    where: { reviewId_userId: { reviewId, userId: user.id } },
  });
  if (existing) return; // schon abgestimmt — nichts tun

  await prisma.reviewVote.create({ data: { reviewId, userId: user.id } });
  await prisma.review.update({
    where: { id: reviewId },
    data: { helpfulCount: { increment: 1 } },
  });

  revalidatePath(`/product/${review.productId}`);
}

// --- Fragen & Antworten ---

/** Stellt eine Produktfrage (max. 5 pro Stunde). Antworten kommen vom Viralo Team. */
export async function askQuestion(productId: string, formData: FormData) {
  const user = await requireUser();
  assertRateLimit(`question:${user.id}`, 5, 60 * 60 * 1000);

  const question = String(formData.get("question") || "").trim();
  if (!question) throw new Error("Bitte eine Frage eingeben.");

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new Error("Produkt nicht gefunden.");

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  const authorName = dbUser?.name || user.email.split("@")[0];

  await prisma.productQuestion.create({
    data: { productId, userId: user.id, authorName, question: question.slice(0, 1000) },
  });

  revalidatePath(`/product/${productId}`);
}

// --- Blitzangebote (Admin) ---

/** Legt einen neuen Deal an (Prozent 5–90, Kontingent >= 1, Start vor Ende). */
export async function createDeal(formData: FormData) {
  await requireAdmin();

  const productId = String(formData.get("productId") || "");
  const percent = parseInt(String(formData.get("percent") || ""), 10);
  const quantity = parseInt(String(formData.get("quantity") || ""), 10);
  const startsAt = new Date(String(formData.get("startsAt") || ""));
  const endsAt = new Date(String(formData.get("endsAt") || ""));

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new Error("Produkt nicht gefunden.");
  if (!Number.isFinite(percent) || percent < 5 || percent > 90) {
    throw new Error("Rabatt muss zwischen 5% und 90% liegen.");
  }
  if (!Number.isFinite(quantity) || quantity < 1) {
    throw new Error("Kontingent muss mindestens 1 sein.");
  }
  if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime()) || startsAt >= endsAt) {
    throw new Error("Der Start muss vor dem Ende liegen.");
  }

  await prisma.deal.create({
    data: { productId, percent, quantity, startsAt, endsAt, active: true },
  });

  revalidatePath("/admin/deals");
  revalidatePath("/");
}

/** Schaltet einen Deal aktiv/inaktiv. */
export async function toggleDeal(dealId: string) {
  await requireAdmin();
  const deal = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new Error("Deal nicht gefunden.");
  await prisma.deal.update({ where: { id: dealId }, data: { active: !deal.active } });
  revalidatePath("/admin/deals");
  revalidatePath("/");
}

/** Löscht einen Deal endgültig. */
export async function deleteDeal(dealId: string) {
  await requireAdmin();
  await prisma.deal.deleteMany({ where: { id: dealId } });
  revalidatePath("/admin/deals");
  revalidatePath("/");
}

// --- Fragen & Antworten (Admin) ---

/** Beantwortet eine Produktfrage und benachrichtigt ggf. die fragende Person. */
export async function answerQuestion(questionId: string, formData: FormData) {
  await requireAdmin();

  const answer = String(formData.get("answer") || "").trim();
  if (!answer) throw new Error("Bitte eine Antwort eingeben.");

  const question = await prisma.productQuestion.findUnique({
    where: { id: questionId },
    include: { product: true },
  });
  if (!question) throw new Error("Frage nicht gefunden.");

  await prisma.productQuestion.update({
    where: { id: questionId },
    data: { answer: answer.slice(0, 2000), answeredAt: new Date() },
  });

  if (question.userId) {
    await prisma.notification.create({
      data: {
        userId: question.userId,
        title: "Deine Frage wurde beantwortet",
        body: `Das Viralo Team hat deine Frage zu "${question.product.name}" beantwortet. Schau auf der Produktseite vorbei!`,
      },
    });
  }

  revalidatePath("/admin/questions");
  revalidatePath(`/product/${question.productId}`);
}

/** Löscht eine Produktfrage (z.B. Spam). */
export async function deleteQuestion(questionId: string) {
  await requireAdmin();
  const question = await prisma.productQuestion.findUnique({ where: { id: questionId } });
  await prisma.productQuestion.deleteMany({ where: { id: questionId } });
  revalidatePath("/admin/questions");
  if (question) revalidatePath(`/product/${question.productId}`);
}

// --- Rücksendungen (Admin) ---

/** Schließt eine angemeldete Rücksendung ab und benachrichtigt den Kunden. */
export async function completeReturn(returnId: string) {
  await requireAdmin();

  const request = await prisma.returnRequest.findUnique({ where: { id: returnId } });
  if (!request) throw new Error("Rücksendung nicht gefunden.");
  if (request.status === "COMPLETED") return;

  await prisma.returnRequest.update({
    where: { id: returnId },
    data: { status: "COMPLETED" },
  });

  const shortId = request.orderId.slice(-6).toUpperCase();
  await prisma.notification.create({
    data: {
      userId: request.userId,
      title: "Rücksendung abgeschlossen",
      body: `Deine Rücksendung für Bestellung #${shortId} wurde abgeschlossen. Demo: Es wurde keine echte Erstattung ausgelöst. (Ref: ${request.orderId})`,
    },
  });

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${request.orderId}`);
  revalidatePath("/admin");
}

// --- Lagerbestand (Admin, Inline-Bearbeitung) ---

/** Setzt den Lagerbestand eines Produkts direkt aus der Produkttabelle. */
export async function updateProductStock(productId: string, formData: FormData) {
  await requireAdmin();

  const stock = parseInt(String(formData.get("stock") || ""), 10);
  if (!Number.isFinite(stock) || stock < 0) {
    throw new Error("Lagerbestand muss 0 oder größer sein.");
  }

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new Error("Produkt nicht gefunden.");

  await prisma.product.update({ where: { id: productId }, data: { stock } });

  revalidatePath("/admin/products");
  revalidatePath("/admin");
  revalidatePath(`/product/${productId}`);
}
