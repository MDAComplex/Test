export default function KontaktPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 prose text-sm text-[#1c1c1f] space-y-4">
      <h1 className="text-2xl font-bold text-[#1c1c1f]">Kontakt</h1>
      <p>
        Viralo.shop ist ein <strong>Demo-/Spiel-Shop</strong>. Bei Fragen zu diesem Projekt
        kannst du uns über die folgenden (fiktiven) Kontaktdaten erreichen:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>
          E-Mail:{" "}
          <a href="mailto:hallo@viralo.shop" className="text-[#ff5a1f] underline">
            hallo@viralo.shop
          </a>
        </li>
        <li>Adresse: Musterstraße 12, 10115 Berlin, Deutschland</li>
        <li>Telefon: +49 30 1234567 (fiktiv, nicht erreichbar)</li>
      </ul>
      <p className="text-[#6b6b76] text-xs pt-4">
        Hinweis: Da es sich um eine Demo-Anwendung handelt, ist dieses Kontaktformular nicht
        funktionsfähig und es werden keine echten Nachrichten verschickt oder empfangen.
      </p>
    </div>
  );
}
