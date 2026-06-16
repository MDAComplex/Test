# Viralo.shop

Ein voll funktionsfähiger Demo-Onlineshop (Next.js + Prisma/SQLite). Echte Produkte, echter
Warenkorb, echter Checkout-Flow – aber **es fließt kein echtes Geld**: die Zahlungsfelder
werden nie geprüft, gespeichert oder verarbeitet. Nach dem "Bestellen" bekommt man einen
fiktiven Versand-Tracking-Verlauf mit realistischen Lieferzeiten.

## Features

- Produktkatalog mit 10 Amazon-artigen Kategorien (Elektronik, Beauty, Mode, Haushalt, Sport,
  Spielzeug, Bücher, Lebensmittel, Tierbedarf, Auto) inkl. 5 Demo-Artikeln pro Kategorie
- Warenkorb, Fake-Checkout, fiktiver Versandstatus mit Tracking-Timeline
- Nutzer-Login/Registrierung inkl. Präferenzen-Auswahl → personalisierter "Für dich"-Feed
- Admin-Panel (geschützt, nur Rolle `ADMIN`):
  - Dashboard: Anzahl Produkte/Nutzer/Bestellungen, Umsatz, aktive Warenkörbe, letzte Bestellungen
  - Produkte anlegen/bearbeiten/löschen (Name, Preis, Bild, Beschreibung, Versandzeit, Lager)
  - Bestellstatus manuell setzen
  - Werbeflächen aktivieren & mit eigenem Anzeigencode (z.B. Google AdSense Snippet) befüllen

## Lokal starten

```bash
npm install
npx prisma migrate deploy   # Datenbank-Schema anlegen
npm run seed                # Admin-Account + Demo-Produkte anlegen
npm run dev
```

Dann [http://localhost:3000](http://localhost:3000) öffnen.

**Admin-Login:** `admin@viralo.shop` / `Admin123!` (bitte nach dem ersten Login-Test in der
Produktion ändern, dafür einfach in `prisma/seed.ts` anpassen oder einen eigenen Admin-User
direkt in der Datenbank erstellen).

## Deployment (kostenlos)

1. Repo zu GitHub pushen (bereits erledigt).
2. Bei [vercel.com](https://vercel.com) mit GitHub einloggen, "New Project" → dieses Repo wählen.
3. Environment Variable `AUTH_SECRET` setzen (Wert aus der lokalen `.env` übernehmen oder neu
   generieren mit `openssl rand -base64 32`).
4. **Wichtig:** SQLite-Dateien sind auf Vercel nicht persistent (jedes Deployment startet mit
   leerer Datenbank). Für den produktiven Einsatz `DATABASE_URL` auf eine gehostete Postgres-DB
   umstellen (z.B. kostenlos via [Neon](https://neon.tech) oder [Vercel Postgres](https://vercel.com/storage/postgres))
   und `provider = "sqlite"` in `prisma/schema.prisma` zu `"postgresql"` ändern.
5. Nach dem ersten Deploy einmalig `npx prisma migrate deploy && npm run seed` gegen die
   produktive Datenbank laufen lassen (z.B. lokal mit der produktiven `DATABASE_URL`).
6. Vercel gibt dir danach eine echte URL wie `https://viralo-shop.vercel.app`.

## Echte Werbung schalten

Im Admin-Panel unter "Werbung" kannst du je Werbeplatz (Startseite oben, im Feed, Checkout)
eigenen Anzeigencode (z.B. von Google AdSense oder einem anderen Netzwerk) einfügen und
aktivieren. Beachte: Damit aus dem Shop ein Geschäftsmodell wird, brauchst du ein eigenes,
genehmigtes Konto beim jeweiligen Werbenetzwerk – das ist außerhalb des Codes und liegt in
deiner Verantwortung (inkl. Einhaltung der Werberichtlinien, da der Shop keine echten
Bestellungen ausliefert).
