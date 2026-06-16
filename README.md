# Viralo.shop

Ein voll funktionsfähiger Demo-Onlineshop (Next.js + Prisma/Postgres). Echte Produkte, echter
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

Das Projekt nutzt eine gehostete Postgres-Datenbank (lokal und in Produktion dieselbe Art von
DB, damit nichts auseinanderläuft). Ein kostenloses Postgres gibt es z.B. in 1 Minute bei
[Neon](https://neon.tech).

## Lokal starten

```bash
cp .env.example .env        # DATABASE_URL und AUTH_SECRET eintragen
npm install                 # führt automatisch `prisma generate` aus
npx prisma db push          # Datenbank-Schema in der Postgres-DB anlegen
npm run seed                # Admin-Account + Demo-Produkte anlegen
npm run dev
```

Dann [http://localhost:3000](http://localhost:3000) öffnen.

**Admin-Login:** `admin@viralo.shop` / `Admin123!` (bitte nach dem ersten Login-Test in der
Produktion ändern, dafür einfach in `prisma/seed.ts` anpassen oder einen eigenen Admin-User
direkt in der Datenbank erstellen).

## Deployment auf Vercel (kostenlos) – Schritt für Schritt

1. **Postgres-Datenbank anlegen:** Auf [neon.tech](https://neon.tech) kostenlos registrieren,
   "New Project" erstellen, dann die Connection-String kopieren (sieht aus wie
   `postgresql://user:password@host/dbname?sslmode=require`).
2. **Repo zu GitHub pushen** (in diesem Projekt bereits erledigt, Branch ist gepusht).
3. Bei [vercel.com](https://vercel.com) mit GitHub einloggen → **"Add New" → "Project"** →
   dieses Repo auswählen → "Import".
4. Im Import-Screen unter **"Environment Variables"** zwei Variablen eintragen:
   - `DATABASE_URL` → die Connection-String aus Schritt 1
   - `AUTH_SECRET` → ein frischer Zufallswert, erzeugt mit `openssl rand -base64 32`
     (nicht den lokalen Dev-Secret wiederverwenden)
5. Auf **"Deploy"** klicken. Vercel installiert die Abhängigkeiten (führt dabei automatisch
   `prisma generate` aus) und baut die App.
6. **Einmalig das Datenbank-Schema in der produktiven DB anlegen und befüllen:** lokal kurz
   `DATABASE_URL` in der `.env` auf die produktive Connection-String aus Schritt 1 setzen und
   ausführen:
   ```bash
   npx prisma db push
   npm run seed
   ```
   (Danach `.env` wieder auf die lokale Dev-Datenbank zurücksetzen, falls gewünscht.)
7. Vercel zeigt dir danach eine echte, öffentliche URL wie `https://viralo-shop.vercel.app` –
   fertig, der Shop ist für jeden erreichbar.

**Hinweis zu Bild-Uploads:** Die App erlaubt im Admin-Panel Bild-Uploads bis 8 MB
(`next.config.ts`). Vercels Serverless Functions haben jedoch ein hartes Limit von ca. 4,5 MB
pro Request – sehr große Bilder können in Produktion fehlschlagen, auch wenn sie lokal
funktionieren. Für den produktiven Einsatz empfiehlt sich, Bilder vor dem Upload zu verkleinern
oder eine kleinere Grenze zu setzen.

## Echte Werbung schalten

Im Admin-Panel unter "Werbung" kannst du je Werbeplatz (Startseite oben, im Feed, Checkout)
eigenen Anzeigencode (z.B. von Google AdSense oder einem anderen Netzwerk) einfügen und
aktivieren. Beachte: Damit aus dem Shop ein Geschäftsmodell wird, brauchst du ein eigenes,
genehmigtes Konto beim jeweiligen Werbenetzwerk – das ist außerhalb des Codes und liegt in
deiner Verantwortung (inkl. Einhaltung der Werberichtlinien, da der Shop keine echten
Bestellungen ausliefert).
