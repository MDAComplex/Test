// Datei-Speicherung mit optionalem Vercel-Blob-Backend.
//
// Ist BLOB_READ_WRITE_TOKEN gesetzt, werden Dateien in den Vercel Blob Store
// hochgeladen (öffentliche URL). Ohne Token fällt storeFile auf Data-URIs
// (Base64 in der Datenbank) zurück — exakt das bisherige Demo-Verhalten,
// damit die App ohne jegliche Env-Variablen funktioniert.

/** Datei als Data-URI (Base64) — der Demo-Fallback ohne Blob-Token. */
async function fileToDataUri(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return `data:${file.type};base64,${buffer.toString("base64")}`;
}

/**
 * Speichert eine Datei und gibt eine URL zurück:
 * - Mit BLOB_READ_WRITE_TOKEN: Upload zu Vercel Blob (public), Rückgabe der CDN-URL.
 * - Ohne Token: Data-URI-Fallback (Base64), wie bisher.
 */
export async function storeFile(file: File, folder: string): Promise<string> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { put } = await import("@vercel/blob");
      const blob = await put(`${folder}/${crypto.randomUUID()}-${file.name}`, file, {
        access: "public",
      });
      return blob.url;
    } catch (error) {
      // Upload fehlgeschlagen (z.B. ungültiger Token): Demo-Fallback verwenden.
      console.error("Blob-Upload fehlgeschlagen, nutze Data-URI-Fallback:", error);
    }
  }
  return fileToDataUri(file);
}
