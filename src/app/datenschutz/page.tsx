export default function DatenschutzPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 prose text-sm text-[#1c1c1f] space-y-4">
      <h1 className="text-2xl font-bold text-[#1c1c1f]">Datenschutz & Hinweise</h1>
      <p>
        Viralo.shop ist ein <strong>Demo-/Spiel-Shop</strong>. Es werden keine echten Bestellungen
        ausgelöst, kein echtes Geld abgebucht und keine Zahlungsdaten verarbeitet oder gespeichert.
      </p>
      <h2 className="text-lg font-semibold text-[#1c1c1f]">Welche Daten werden gespeichert?</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li>E-Mail-Adresse, Name (optional) und ein gehashtes Passwort für deinen Account.</li>
        <li>Deine ausgewählten Interessen/Präferenzen für den personalisierten Feed.</li>
        <li>Warenkorb- und Bestelldaten (fiktiv) sowie Coins/Streak/Rewards-Fortschritt.</li>
        <li>Eingegebene Lieferadresse im Demo-Checkout (rein fiktiv genutzt, nicht versendet).</li>
      </ul>
      <h2 className="text-lg font-semibold text-[#1c1c1f]">Was wir NICHT speichern</h2>
      <p>Zahlungsdaten (Kartennummer etc.) werden nicht gespeichert, geprüft oder übertragen.</p>
      <p className="text-[#6b6b76] text-xs pt-4">
        Hinweis für den Betreiber: Für den echten Live-Betrieb mit echten Nutzern (DSGVO/CH-DSG)
        solltest du u.a. ergänzen: Verantwortlicher mit Kontaktadresse, Rechtsgrundlage der
        Verarbeitung, Speicherdauer, Auskunfts-/Löschrecht der Nutzer, Hosting-Standort, sowie
        ggf. Cookie-Hinweise, sobald echte Tracking-/Werbecookies (z.B. von Ad-Netzwerken)
        eingebunden werden.
      </p>
    </div>
  );
}
