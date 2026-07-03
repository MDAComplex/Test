import ProductImage from "@/components/ProductImage";
import type { Category, Product } from "@prisma/client";

const inputCls = "w-full bg-[#f4f4f5] border border-[#e5e5e8] rounded-xl px-3 py-2 text-sm";
const labelCls = "block text-xs font-medium text-[#6b6b76] mb-1";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border border-[#e5e5e8] rounded-xl p-4">
      <legend className="px-2 text-sm font-bold text-[#1c1c1f]">{title}</legend>
      <div className="grid md:grid-cols-2 gap-3">{children}</div>
    </fieldset>
  );
}

/**
 * Gemeinsames Produktformular für Anlegen und Bearbeiten.
 * Die umgebende Seite liefert die passende Server-Action als `action`.
 */
export type ProductFormDefaults = {
  description?: string;
  stock?: number;
  shippingMinDays?: number;
  shippingMaxDays?: number;
  discountPercent?: number;
  categoryId?: string;
};

export default function ProductForm({
  action,
  categories,
  product,
  defaults,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  categories: Category[];
  product?: Product;
  /** Vorbefüllung (z.B. aus Vorlagen); `product` hat immer Vorrang. */
  defaults?: ProductFormDefaults;
  submitLabel: string;
}) {
  return (
    <form action={action} encType="multipart/form-data" className="space-y-5">
      <Section title="Basisdaten">
        <div>
          <label className={labelCls}>Name *</label>
          <input name="name" required defaultValue={product?.name ?? ""} placeholder="Produktname" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Kategorie *</label>
          <select name="categoryId" required defaultValue={product?.categoryId ?? defaults?.categoryId ?? ""} className={inputCls}>
            <option value="">Kategorie wählen…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Preis (€) *</label>
          <input name="price" type="number" step="0.01" min="0.01" required defaultValue={product?.price ?? ""} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Rabatt (%)</label>
          <input name="discountPercent" type="number" min={0} max={90} defaultValue={product?.discountPercent ?? defaults?.discountPercent ?? 0} className={inputCls} />
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>Beschreibung</label>
          <textarea name="description" rows={3} defaultValue={product?.description ?? defaults?.description ?? ""} className={inputCls} />
        </div>
      </Section>

      <Section title="Medien">
        <div>
          <label className={labelCls}>Hauptbild hochladen</label>
          <input name="imageFile" type="file" accept="image/*" className="block w-full text-sm" />
          <p className="text-xs text-[#6b6b76] mt-1">Max. 4 MB. Ersetzt Bild-URL/Emoji.</p>
        </div>
        <div>
          <label className={labelCls}>Oder Bild-URL / Emoji</label>
          <input
            name="image"
            defaultValue={product && !product.image.startsWith("data:") ? product.image : ""}
            placeholder="https://… oder Emoji"
            className={inputCls}
          />
        </div>
        {product && (
          <div className="md:col-span-2 flex items-center gap-3">
            <span className="text-xs text-[#6b6b76]">Aktuelles Hauptbild:</span>
            <span className="w-14 h-14 rounded-xl bg-[#f4f4f5] border border-[#e5e5e8] flex items-center justify-center overflow-hidden">
              <ProductImage image={product.image} className="w-full h-full object-cover flex items-center justify-center text-2xl" />
            </span>
          </div>
        )}

        <div className="md:col-span-2">
          <label className={labelCls}>Galerie-Bilder hinzufügen (Mehrfachauswahl)</label>
          <input name="galleryFiles" type="file" accept="image/*" multiple className="block w-full text-sm" />
          <p className="text-xs text-[#6b6b76] mt-1">Max. 4 MB pro Bild.</p>
        </div>
        {product && product.images.length > 0 && (
          <div className="md:col-span-2">
            <p className={labelCls}>Aktuelle Galerie (zum Entfernen ankreuzen):</p>
            <div className="flex flex-wrap gap-3">
              {product.images.map((img, i) => (
                <label key={i} className="flex flex-col items-center gap-1 cursor-pointer">
                  <span className="w-16 h-16 rounded-xl bg-[#f4f4f5] border border-[#e5e5e8] flex items-center justify-center overflow-hidden">
                    <ProductImage image={img} className="w-full h-full object-cover flex items-center justify-center text-2xl" />
                  </span>
                  <span className="flex items-center gap-1 text-xs text-[#6b6b76]">
                    <input type="checkbox" name="removeGalleryIndex" value={i} /> Bild entfernen
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="md:col-span-2">
          <label className={labelCls}>Produktvideo hochladen</label>
          <input name="videoFile" type="file" accept="video/*" className="block w-full text-sm" />
          <p className="text-xs text-[#6b6b76] mt-1">Max. 20 MB. Ersetzt ein vorhandenes Video.</p>
        </div>
        {product?.videoUrl && (
          <div className="md:col-span-2 space-y-2">
            <video src={product.videoUrl} controls className="max-w-xs rounded-xl border border-[#e5e5e8]" />
            <label className="flex items-center gap-2 text-sm text-[#6b6b76]">
              <input type="checkbox" name="removeVideo" /> Video entfernen
            </label>
          </div>
        )}
      </Section>

      <Section title="Lager & Versand">
        <div>
          <label className={labelCls}>Lagerbestand</label>
          <input name="stock" type="number" min={0} defaultValue={product?.stock ?? defaults?.stock ?? 99} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Versand min. Tage</label>
            <input name="shippingMinDays" type="number" min={0} defaultValue={product?.shippingMinDays ?? defaults?.shippingMinDays ?? 2} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Versand max. Tage</label>
            <input name="shippingMaxDays" type="number" min={0} defaultValue={product?.shippingMaxDays ?? defaults?.shippingMaxDays ?? 5} className={inputCls} />
          </div>
        </div>
      </Section>

      <Section title="Sonstiges">
        <div className="md:col-span-2">
          <label className={labelCls}>Affiliate-/Kauf-URL (optional)</label>
          <input name="affiliateUrl" defaultValue={product?.affiliateUrl ?? ""} placeholder="https://…" className={inputCls} />
        </div>
      </Section>

      <button className="w-full bg-[#ff5a1f] text-white py-2.5 rounded-xl font-semibold hover:opacity-90">
        {submitLabel}
      </button>
    </form>
  );
}
