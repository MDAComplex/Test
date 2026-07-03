// Transaktions-E-Mails mit optionalem Resend-Backend.
//
// Ist RESEND_API_KEY gesetzt, werden E-Mails via Resend-API verschickt
// (fire-and-forget, Fehler werden nur geloggt — nie geworfen). Ohne Key ist
// der Versand ein No-op: die In-App-Benachrichtigungen bleiben der Fallback.

/** Einfacher gebrandeter HTML-Rahmen für Shop-Mails. */
export function shopEmailHtml(heading: string, bodyText: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
      <div style="background:#ff5a1f;border-radius:16px 16px 0 0;padding:20px 24px;">
        <span style="color:#ffffff;font-size:20px;font-weight:bold;">Viralo.shop</span>
      </div>
      <div style="background:#ffffff;border:1px solid #e5e5e8;border-top:none;border-radius:0 0 16px 16px;padding:24px;">
        <h1 style="margin:0 0 12px;font-size:18px;color:#1c1c1f;">${heading}</h1>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#1c1c1f;">${bodyText}</p>
      </div>
      <p style="margin:16px 8px 0;font-size:12px;color:#6b6b76;">
        Dies ist eine Demo-Mail von Viralo.shop — es wurden keine echten Bestellungen aufgegeben und keine Zahlungen verarbeitet.
      </p>
    </div>
  </body>
</html>`;
}

/**
 * Verschickt eine Shop-Mail via Resend, wenn RESEND_API_KEY gesetzt ist.
 * Wirft nie — Mail-Versand darf den eigentlichen Flow nicht kaputt machen.
 */
export async function sendShopEmail(
  to: string,
  subject: string,
  htmlBody: string
): Promise<{ simulated: boolean }> {
  if (!process.env.RESEND_API_KEY) {
    return { simulated: true };
  }
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Viralo.shop <onboarding@resend.dev>",
        to,
        subject,
        html: htmlBody,
      }),
    });
  } catch (error) {
    console.error("E-Mail-Versand fehlgeschlagen (ignoriert):", error);
  }
  return { simulated: false };
}
