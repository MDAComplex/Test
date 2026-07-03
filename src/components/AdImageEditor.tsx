"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";

type Props = {
  // Name des echten File-Inputs (Fallback ohne JS: Original-Datei wird gesendet).
  fileInputName: string;
  // Name des Hidden-Inputs mit dem zugeschnittenen Bild als Data-URI.
  croppedInputName: string;
  targetWidth: number;
  targetHeight: number;
  kindLabel: string; // z.B. "Banner" oder "Hero-Hintergrund"
};

const MAX_DATA_URL_CHARS = 2_800_000; // ≈ 2 MB Binärdaten als Base64

// Upload-first Bild-Editor: Datei wählen, Ausschnitt per Drag + Zoom festlegen,
// Ergebnis wird per Canvas in den Zielmaßen "gebacken" und als Data-URI übertragen.
// Ohne JS degradiert der Editor zum normalen File-Input (Original wird gespeichert).
export default function AdImageEditor({ fileInputName, croppedInputName, targetWidth, targetHeight, kindLabel }: Props) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [isGif, setIsGif] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // in Ziel-Pixeln, <= 0
  const [croppedDataUrl, setCroppedDataUrl] = useState("");
  const [boxWidth, setBoxWidth] = useState(0);

  const boxRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);

  // Breite des Vorschau-Containers messen (für die Umrechnung Drag-Pixel → Ziel-Pixel).
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () => setBoxWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [img]);

  const coverScale = img ? Math.max(targetWidth / img.naturalWidth, targetHeight / img.naturalHeight) : 1;
  const totalScale = coverScale * zoom;
  const drawnW = img ? img.naturalWidth * totalScale : 0;
  const drawnH = img ? img.naturalHeight * totalScale : 0;

  const clampOffset = useCallback(
    (x: number, y: number, z: number) => {
      if (!img) return { x: 0, y: 0 };
      const t = coverScale * z;
      const minX = targetWidth - img.naturalWidth * t;
      const minY = targetHeight - img.naturalHeight * t;
      return { x: Math.min(0, Math.max(minX, x)), y: Math.min(0, Math.max(minY, y)) };
    },
    [img, coverScale, targetWidth, targetHeight]
  );

  // Sichtbaren Ausschnitt in den Zielmaßen auf ein Canvas zeichnen.
  const bake = useCallback(
    (image: HTMLImageElement, off: { x: number; y: number }, z: number) => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return "";
        const t = Math.max(targetWidth / image.naturalWidth, targetHeight / image.naturalHeight) * z;
        ctx.drawImage(image, -off.x / t, -off.y / t, targetWidth / t, targetHeight / t, 0, 0, targetWidth, targetHeight);
        for (const quality of [0.85, 0.7, 0.5]) {
          const url = canvas.toDataURL("image/jpeg", quality);
          if (url.length <= MAX_DATA_URL_CHARS) return url;
        }
        return ""; // zu groß → Original-Datei wird unverändert gesendet
      } catch {
        return ""; // Canvas-Export fehlgeschlagen → Fallback auf Original-Datei
      }
    },
    [targetWidth, targetHeight]
  );

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setImg(null);
    setCroppedDataUrl("");
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setIsGif(false);
    if (!file) return;
    if (file.type === "image/gif") {
      // Canvas-Baking würde die Animation zerstören → GIF unverändert übernehmen.
      setIsGif(true);
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      setImg(image);
      setCroppedDataUrl(bake(image, { x: 0, y: 0 }, 1));
    };
    image.onerror = () => URL.revokeObjectURL(url);
    image.src = url;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!img) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, baseX: offset.x, baseY: offset.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || !img || !boxWidth) return;
    const k = boxWidth / targetWidth; // Anzeige-Pixel → Ziel-Pixel
    const next = clampOffset(drag.baseX + (e.clientX - drag.startX) / k, drag.baseY + (e.clientY - drag.startY) / k, zoom);
    setOffset(next);
  };

  const onPointerUp = () => {
    if (!dragRef.current || !img) return;
    dragRef.current = null;
    setCroppedDataUrl(bake(img, offset, zoom));
  };

  const onZoom = (z: number) => {
    setZoom(z);
    const next = clampOffset(offset.x, offset.y, z);
    setOffset(next);
    if (img) setCroppedDataUrl(bake(img, next, z));
  };

  const k = boxWidth > 0 ? boxWidth / targetWidth : 0;

  return (
    <div className="space-y-2">
      <label className="flex items-center justify-center gap-2 w-full bg-[#ff5a1f]/10 border-2 border-dashed border-[#ff5a1f]/50 text-[#ff5a1f] rounded-xl px-4 py-3 text-sm font-semibold cursor-pointer hover:bg-[#ff5a1f]/15">
        <Upload size={16} />
        Bild hochladen
        <input name={fileInputName} type="file" accept="image/*" onChange={onFileChange} className="sr-only" />
      </label>
      <p className="text-[11px] text-[#6b6b76]">
        Empfohlen: {targetWidth} × {targetHeight} ({kindLabel}). GIF für kleine Animationen möglich.
      </p>

      {isGif && (
        <p className="text-[11px] text-[#6b6b76] bg-[#f7f7f8] border border-[#e5e5e8] rounded-lg px-2 py-1.5">
          GIF wird unverändert übernommen (kein Zuschnitt, damit die Animation erhalten bleibt).
        </p>
      )}

      {/* Zuschnitt-Vorschau im Ziel-Seitenverhältnis; ohne Bild: grauer Platzhalter */}
      {!isGif && (
        <div
          ref={boxRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={`relative w-full overflow-hidden rounded-xl border border-[#e5e5e8] bg-[#f4f4f5] select-none ${
            img ? "cursor-grab active:cursor-grabbing touch-none" : ""
          }`}
          style={{ aspectRatio: `${targetWidth} / ${targetHeight}` }}
        >
          {img && k > 0 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={img.src}
              alt="Ausschnitt-Vorschau"
              draggable={false}
              className="absolute max-w-none pointer-events-none"
              style={{
                width: drawnW * k,
                height: drawnH * k,
                left: offset.x * k,
                top: offset.y * k,
              }}
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-xs text-[#6b6b76]">
              {targetWidth} × {targetHeight} ({kindLabel})
            </span>
          )}
        </div>
      )}

      {img && !isGif && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#6b6b76] shrink-0">Zoom</span>
          <input
            type="range"
            min={1}
            max={2}
            step={0.01}
            value={zoom}
            onChange={(e) => onZoom(Number(e.target.value))}
            className="w-full accent-[#ff5a1f]"
          />
          <span className="text-[11px] text-[#6b6b76] shrink-0 w-16 text-right">Ziehen zum Positionieren</span>
        </div>
      )}

      <input type="hidden" name={croppedInputName} value={croppedDataUrl} />
    </div>
  );
}
