import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { CATEGORIES } from "../src/lib/categories";

const prisma = new PrismaClient();

const PRODUCTS: Record<string, { name: string; description: string; price: number; image: string; shippingMinDays?: number; shippingMaxDays?: number }[]> = {
  elektronik: [
    { name: "Wireless Bluetooth Kopfhörer Pro", description: "Over-Ear Kopfhörer mit aktivem Noise Cancelling und 40h Akkulaufzeit.", price: 79.99, image: "🎧" },
    { name: "4K Smart Action Cam", description: "Wasserdichte Action-Kamera mit 4K60fps und Bildstabilisierung.", price: 129.0, image: "📷" },
    { name: "Mechanische Gaming Tastatur RGB", description: "Hot-Swap mechanische Tastatur mit anpassbarer RGB-Beleuchtung.", price: 64.5, image: "⌨️" },
    { name: "Power Bank 20000mAh", description: "Schnellladende Powerbank mit USB-C PD und zwei USB-A Anschlüssen.", price: 34.9, image: "🔋" },
    { name: "Smartwatch FitTrack X3", description: "Fitness-Smartwatch mit Herzfrequenzmessung, GPS und 10 Tage Akku.", price: 99.99, image: "⌚" },
  ],
  beauty: [
    { name: "Matte Liquid Lippenstift Set", description: "6er-Set langanhaltender matter Lippenstifte in trendigen Farbtönen.", price: 19.99, image: "💋" },
    { name: "Vitamin C Serum 30ml", description: "Aufhellendes Anti-Aging Gesichtsserum mit Hyaluronsäure.", price: 14.5, image: "🧴" },
    { name: "Profi Make-up Pinsel Set (12-teilig)", description: "Weiche synthetische Pinsel für Foundation, Lidschatten und Contouring.", price: 22.0, image: "🖌️" },
    { name: "Eyeshadow Palette 18 Farben", description: "Schimmernde und matte Lidschatten-Palette für jeden Look.", price: 17.99, image: "🎨" },
    { name: "Parfum Eau de Parfum 50ml", description: "Blumig-orientalischer Damenduft mit langanhaltender Sillage.", price: 39.0, image: "🌸" },
  ],
  mode: [
    { name: "Oversized Hoodie Unisex", description: "Kuscheliger Hoodie aus Bio-Baumwolle, perfekt für den Alltag.", price: 39.99, image: "👕" },
    { name: "Slim Fit Jeans Herren", description: "Stretch-Jeans mit modernem Slim-Fit-Schnitt.", price: 44.0, image: "👖" },
    { name: "Sommerkleid Blumenprint", description: "Luftiges Midikleid mit floralem Muster, ideal für den Sommer.", price: 29.99, image: "👗" },
    { name: "Sneaker Classic White", description: "Zeitlose weiße Sneaker aus veganem Leder.", price: 54.99, image: "👟" },
    { name: "Wollmantel Damen", description: "Eleganter Wollmantel mit Gürtel für die kalte Jahreszeit.", price: 89.0, image: "🧥" },
  ],
  haushalt: [
    { name: "Roboter-Staubsauger SmartClean", description: "App-gesteuerter Saugroboter mit Kartierungsfunktion.", price: 199.0, image: "🤖" },
    { name: "Edelstahl Kochtopf-Set (5-teilig)", description: "Induktionsgeeignetes Kochgeschirr-Set mit Glasdeckeln.", price: 74.99, image: "🍳" },
    { name: "LED Schreibtischlampe dimmbar", description: "Augenschonende LED-Lampe mit USB-Ladeanschluss.", price: 24.99, image: "💡" },
    { name: "Bettwäsche-Set Baumwolle 135x200", description: "Weiche Mikrofaser-Bettwäsche in mehreren Farben.", price: 19.5, image: "🛏️" },
    { name: "Duftkerzen Set (3 Stück)", description: "Sojawachs-Duftkerzen mit Vanille-, Lavendel- und Zedernholzduft.", price: 16.0, image: "🕯️" },
  ],
  sport: [
    { name: "Yogamatte Premium 6mm", description: "Rutschfeste Yogamatte mit Tragegurt, ideal für Yoga & Pilates.", price: 21.99, image: "🧘" },
    { name: "Verstellbare Kurzhantel-Set 2x10kg", description: "Platzsparende Hantel mit verstellbarem Gewicht.", price: 59.0, image: "🏋️" },
    { name: "Laufschuhe AirFlex", description: "Leichte Laufschuhe mit atmungsaktivem Mesh-Obermaterial.", price: 64.99, image: "👟" },
    { name: "Fahrradhelm Aero", description: "Aerodynamischer Fahrradhelm mit verstellbarem Verschlusssystem.", price: 34.0, image: "🚴" },
    { name: "Fitness Tracker Armband", description: "Wasserdichtes Fitnessarmband mit Schrittzähler und Schlaftracking.", price: 27.5, image: "📿" },
  ],
  spielzeug: [
    { name: "Bausteine Bauset 1200 Teile", description: "Kompatibles Bauklötze-Set für kreative Konstruktionen.", price: 32.99, image: "🧱" },
    { name: "RC Rennauto 1:18", description: "Ferngesteuertes Rennauto mit Hochgeschwindigkeitsmodus.", price: 41.0, image: "🏎️" },
    { name: "Plüschtier Riesenbär 80cm", description: "Super weicher Kuschelbär aus hypoallergenem Plüsch.", price: 28.0, image: "🧸" },
    { name: "Brettspiel Strategiespaß", description: "Familienspiel für 2-6 Spieler ab 8 Jahren.", price: 24.5, image: "🎲" },
    { name: "Puzzle 1000 Teile Weltkarte", description: "Hochwertiges Puzzle mit detaillierter Weltkarten-Illustration.", price: 14.99, image: "🧩" },
  ],
  buecher: [
    { name: "Der Geheime Garten - Roman", description: "Mitreißender Bestseller-Roman, gebundene Ausgabe.", price: 18.0, image: "📕" },
    { name: "Kochbuch: Schnelle Feierabendküche", description: "100 einfache Rezepte für jeden Tag.", price: 22.99, image: "📗" },
    { name: "Kinderbuch: Abenteuer im Zauberwald", description: "Liebevoll illustriertes Bilderbuch ab 4 Jahren.", price: 12.5, image: "📘" },
    { name: "Hörbuch CD: Krimi-Klassiker", description: "Spannender Krimi als ungekürzte Lesung auf CD.", price: 15.99, image: "💿" },
    { name: "Notizbuch Premium Hardcover A5", description: "Liniertes Notizbuch mit hochwertigem Papier und Lesebändchen.", price: 9.99, image: "📓" },
  ],
  lebensmittel: [
    { name: "Bio Kaffeebohnen 1kg", description: "Aromatische Arabica-Bohnen aus fairem Handel, schonend geröstet.", price: 16.99, image: "☕" },
    { name: "Schokoladen Geschenkbox", description: "Edle Pralinen-Mischung in liebevoller Geschenkverpackung.", price: 13.5, image: "🍫" },
    { name: "Bio Müsli Mix 750g", description: "Knuspriges Müsli mit Nüssen, Beeren und Honig.", price: 7.99, image: "🥣" },
    { name: "Gewürz-Set Weltküche (10er)", description: "Hochwertige Gewürze für asiatische, indische und mediterrane Küche.", price: 19.0, image: "🌶️" },
    { name: "Craft Bier Probierpaket (12 Flaschen)", description: "Vielfältige Auswahl regionaler Craft-Biere.", price: 24.99, image: "🍺" },
  ],
  tierbedarf: [
    { name: "Hundeleine gepolstert 2m", description: "Reflektierende, robuste Leine mit gepolstertem Griff.", price: 14.99, image: "🐕" },
    { name: "Katzenkratzbaum XL", description: "Stabiler Kratzbaum mit mehreren Etagen und Höhlen.", price: 49.99, image: "🐈" },
    { name: "Premium Trockenfutter Hund 15kg", description: "Getreidefreies Alleinfutter mit hohem Fleischanteil.", price: 54.0, image: "🦴" },
    { name: "Aquarium Komplettset 60L", description: "Komplettset inkl. Filter, Beleuchtung und Heizer.", price: 89.0, image: "🐠" },
    { name: "Vogelkäfig mit Zubehör", description: "Geräumiger Käfig inkl. Sitzstangen, Näpfen und Spielzeug.", price: 39.99, image: "🦜" },
  ],
  auto: [
    { name: "Allwetter Fußmatten Set (4-teilig)", description: "Passgenaue, rutschfeste Fußmatten für nahezu jedes Modell.", price: 29.99, image: "🚗" },
    { name: "Dashcam Full HD mit GPS", description: "Unauffällige Dashcam mit Loop-Recording und Nachtsicht.", price: 49.0, image: "📹" },
    { name: "Mikrofaser Auto-Poliertuch (6er Set)", description: "Kratzfreie Tücher für streifenfreie Lackpflege.", price: 11.99, image: "🧽" },
    { name: "KFZ Starthilfe Powerbank", description: "Kompaktes Jump-Starter-Gerät mit integrierter Taschenlampe.", price: 64.99, image: "🔋" },
    { name: "Motorradhandschuhe Leder", description: "Robuste Lederhandschuhe mit Knöchelschutz.", price: 34.5, image: "🧤" },
  ],
};

async function main() {
  const adminEmail = "admin@viralo.shop";
  const adminPassword = "Admin123!";
  const adminHash = await bcrypt.hash(adminPassword, 10);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: "Shop Admin",
      passwordHash: adminHash,
      role: "ADMIN",
    },
  });

  for (const cat of CATEGORIES) {
    const category = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, emoji: cat.emoji },
      create: { slug: cat.slug, name: cat.name, emoji: cat.emoji },
    });

    const products = PRODUCTS[cat.slug] ?? [];
    for (const p of products) {
      const existing = await prisma.product.findFirst({
        where: { name: p.name, categoryId: category.id },
      });
      if (!existing) {
        await prisma.product.create({
          data: {
            name: p.name,
            description: p.description,
            price: p.price,
            image: p.image,
            categoryId: category.id,
            shippingMinDays: p.shippingMinDays ?? Math.floor(Math.random() * 2) + 1,
            shippingMaxDays: p.shippingMaxDays ?? Math.floor(Math.random() * 3) + 4,
          },
        });
      }
    }
  }

  const adSlots = [
    { slot: "home-top", label: "Werbebanner – Startseite oben" },
    { slot: "home-feed", label: "Werbeanzeige – im Produkt-Feed" },
    { slot: "checkout-sidebar", label: "Werbung – Checkout Seitenleiste" },
  ];
  for (const a of adSlots) {
    await prisma.adSlot.upsert({
      where: { slot: a.slot },
      update: {},
      create: { slot: a.slot, label: a.label, enabled: false, html: "" },
    });
  }

  console.log("Seed fertig. Admin-Login:", adminEmail, "/", adminPassword);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
