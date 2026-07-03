"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, X, Film, Link2 } from "lucide-react";
import ProductImage from "@/components/ProductImage";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB
const MAX_VIDEO_BYTES = 20 * 1024 * 1024; // 20 MB

const dropZoneCls =
  "flex items-center justify-center gap-2 w-full bg-[#ff5a1f]/10 border-2 border-dashed border-[#ff5a1f]/50 text-[#ff5a1f] rounded-xl px-4 py-4 text-sm font-semibold cursor-pointer hover:bg-[#ff5a1f]/15 transition-colors";
const hintCls = "text-[11px] text-[#6b6b76]";
const warnCls = "text-xs text-red-600 font-medium";
const thumbCls =
  "w-16 h-16 rounded-xl bg-[#f4f4f5] border border-[#e5e5e8] flex items-center justify-center overflow-hidden";

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function preventDefaults(e: React.DragEvent) {
  e.preventDefault();
  e.stopPropagation();
}

/**
 * Upload-first Medien-Bereich für das Produktformular (Hauptbild, Galerie, Video).
 * Alle Inputs sind echte Formularfelder (Namen unverändert: imageFile, image,
 * galleryFiles, removeGalleryIndex, videoFile, removeVideo) — ohne JS degradiert
 * das Ganze zu normalen File-Inputs (Progressive Enhancement).
 */
export default function ProductMediaUpload({
  image,
  images = [],
  videoUrl,
}: {
  /** Aktuelles Hauptbild (URL, Data-URI oder Emoji), falls vorhanden. */
  image?: string;
  /** Vorhandene Galerie-Bilder. */
  images?: string[];
  /** Vorhandenes Produktvideo. */
  videoUrl?: string | null;
}) {
  // ---- Hauptbild ----
  const mainInputRef = useRef<HTMLInputElement | null>(null);
  const [mainPreview, setMainPreview] = useState<string | null>(null);
  const [mainFile, setMainFile] = useState<{ name: string; size: number } | null>(null);
  const [mainError, setMainError] = useState<string | null>(null);
  const [showUrlField, setShowUrlField] = useState(false);

  // ---- Galerie ----
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  // Quelle der Wahrheit für neue Galerie-Dateien (der Browser ersetzt input.files bei jeder Auswahl).
  const galleryFilesRef = useRef<File[]>([]);
  const [galleryPreviews, setGalleryPreviews] = useState<{ url: string; name: string; size: number }[]>([]);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [removedExisting, setRemovedExisting] = useState<Set<number>>(new Set());

  // ---- Video ----
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [videoFileInfo, setVideoFileInfo] = useState<{ name: string; size: number } | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [removeExistingVideo, setRemoveExistingVideo] = useState(false);

  // Object-URLs beim Unmount freigeben.
  useEffect(() => {
    return () => {
      if (mainPreview?.startsWith("blob:")) URL.revokeObjectURL(mainPreview);
      galleryPreviews.forEach((p) => URL.revokeObjectURL(p.url));
      if (videoPreview) URL.revokeObjectURL(videoPreview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Datei(en) einem versteckten File-Input zuweisen (für Drag&Drop / Entfernen einzelner Dateien).
  function assignFiles(input: HTMLInputElement | null, files: File[]) {
    if (!input) return false;
    try {
      const dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f));
      input.files = dt.files;
      return true;
    } catch {
      // DataTransfer nicht verfügbar → alles leeren als Fallback.
      input.value = "";
      return false;
    }
  }

  // ---------- Hauptbild ----------
  function setMainFromFile(file: File | null) {
    if (mainPreview?.startsWith("blob:")) URL.revokeObjectURL(mainPreview);
    if (!file) {
      setMainPreview(null);
      setMainFile(null);
      setMainError(null);
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setMainError(`„${file.name}“ (${formatSize(file.size)}) ist zu groß — max. 4 MB.`);
      if (mainInputRef.current) mainInputRef.current.value = "";
      setMainPreview(null);
      setMainFile(null);
      return;
    }
    setMainError(null);
    setMainPreview(URL.createObjectURL(file));
    setMainFile({ name: file.name, size: file.size });
  }

  function onMainDrop(e: React.DragEvent) {
    preventDefaults(e);
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setMainFromFile(file); // erzeugt die Fehlermeldung und leert den Input
      return;
    }
    if (assignFiles(mainInputRef.current, [file])) setMainFromFile(file);
  }

  function clearMain() {
    if (mainInputRef.current) mainInputRef.current.value = "";
    setMainFromFile(null);
  }

  // ---------- Galerie ----------
  function syncGalleryPreviews(files: File[]) {
    galleryPreviews.forEach((p) => URL.revokeObjectURL(p.url));
    setGalleryPreviews(files.map((f) => ({ url: URL.createObjectURL(f), name: f.name, size: f.size })));
  }

  function addGalleryFiles(incoming: File[]) {
    const ok: File[] = [];
    const tooBig: File[] = [];
    incoming.forEach((f) => (f.size > MAX_IMAGE_BYTES ? tooBig.push(f) : ok.push(f)));
    setGalleryError(
      tooBig.length > 0
        ? `Zu groß — max. 4 MB pro Bild: ${tooBig.map((f) => `„${f.name}“ (${formatSize(f.size)})`).join(", ")}`
        : null
    );
    const next = [...galleryFilesRef.current, ...ok];
    if (assignFiles(galleryInputRef.current, next)) {
      galleryFilesRef.current = next;
    } else {
      galleryFilesRef.current = [];
    }
    syncGalleryPreviews(galleryFilesRef.current);
  }

  function onGalleryChange(e: React.ChangeEvent<HTMLInputElement>) {
    addGalleryFiles(Array.from(e.target.files ?? []));
  }

  function onGalleryDrop(e: React.DragEvent) {
    preventDefaults(e);
    addGalleryFiles(Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/")));
  }

  function removeGalleryFile(index: number) {
    const files = [...galleryFilesRef.current];
    files.splice(index, 1);
    if (assignFiles(galleryInputRef.current, files)) {
      galleryFilesRef.current = files;
    } else {
      galleryFilesRef.current = [];
    }
    syncGalleryPreviews(galleryFilesRef.current);
    setGalleryError(null);
  }

  function toggleRemoveExisting(i: number) {
    setRemovedExisting((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  // ---------- Video ----------
  function setVideoFromFile(file: File | null) {
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    if (!file) {
      setVideoPreview(null);
      setVideoFileInfo(null);
      setVideoError(null);
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setVideoError(`„${file.name}“ (${formatSize(file.size)}) ist zu groß — max. 20 MB.`);
      if (videoInputRef.current) videoInputRef.current.value = "";
      setVideoPreview(null);
      setVideoFileInfo(null);
      return;
    }
    setVideoError(null);
    setVideoPreview(URL.createObjectURL(file));
    setVideoFileInfo({ name: file.name, size: file.size });
  }

  function onVideoDrop(e: React.DragEvent) {
    preventDefaults(e);
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("video/"));
    if (!file) return;
    if (file.size > MAX_VIDEO_BYTES) {
      setVideoFromFile(file);
      return;
    }
    if (assignFiles(videoInputRef.current, [file])) setVideoFromFile(file);
  }

  function clearVideo() {
    if (videoInputRef.current) videoInputRef.current.value = "";
    setVideoFromFile(null);
  }

  const currentImageUrl = image && !image.startsWith("data:") ? image : "";

  return (
    <>
      {/* ================= Hauptbild ================= */}
      <div className="md:col-span-2 space-y-2">
        <span className="block text-xs font-medium text-[#6b6b76]">Hauptbild</span>
        <label className={dropZoneCls} onDragOver={preventDefaults} onDrop={onMainDrop}>
          <Upload size={16} />
          Hauptbild hochladen
          <input
            ref={mainInputRef}
            name="imageFile"
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => setMainFromFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <p className={hintCls}>PNG, JPG, WebP oder GIF — max. 4 MB. Auch per Drag &amp; Drop. Ersetzt Bild-URL/Emoji.</p>
        {mainError && <p className={warnCls}>{mainError}</p>}

        {mainPreview && mainFile ? (
          <div className="flex items-center gap-3">
            <span className={thumbCls}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mainPreview} alt="" className="w-full h-full object-cover" />
            </span>
            <span className="text-xs text-[#6b6b76] min-w-0 truncate">
              {mainFile.name} · {formatSize(mainFile.size)}
            </span>
            <button
              type="button"
              onClick={clearMain}
              className="text-xs text-red-600 font-medium hover:underline shrink-0"
            >
              Entfernen
            </button>
          </div>
        ) : image ? (
          <div className="flex items-center gap-3">
            <span className={thumbCls}>
              <ProductImage image={image} className="w-full h-full object-cover flex items-center justify-center text-2xl" />
            </span>
            <span className="text-xs text-[#6b6b76]">Aktuelles Hauptbild</span>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setShowUrlField((v) => !v)}
          className="flex items-center gap-1 text-xs text-[#6b6b76] hover:text-[#1c1c1f] underline underline-offset-2"
        >
          <Link2 size={12} />
          URL/Emoji stattdessen verwenden
        </button>
        <div className={showUrlField ? "" : "hidden"}>
          <label className="block text-xs font-medium text-[#6b6b76] mb-1">Bild-URL / Emoji</label>
          <input
            name="image"
            defaultValue={currentImageUrl}
            placeholder="https://… oder Emoji"
            className="w-full bg-[#f4f4f5] border border-[#e5e5e8] rounded-xl px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* ================= Galerie ================= */}
      <div className="md:col-span-2 space-y-2 pt-2 border-t border-[#e5e5e8]">
        <span className="block text-xs font-medium text-[#6b6b76]">Galerie</span>
        <label className={dropZoneCls} onDragOver={preventDefaults} onDrop={onGalleryDrop}>
          <Upload size={16} />
          Galerie-Bilder hochladen (Mehrfachauswahl)
          <input
            ref={galleryInputRef}
            name="galleryFiles"
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={onGalleryChange}
          />
        </label>
        <p className={hintCls}>PNG, JPG, WebP oder GIF — max. 4 MB pro Bild. Auch per Drag &amp; Drop.</p>
        {galleryError && <p className={warnCls}>{galleryError}</p>}

        {(galleryPreviews.length > 0 || images.length > 0) && (
          <div className="flex flex-wrap gap-3">
            {/* Vorhandene Galerie-Bilder */}
            {images.map((img, i) => {
              const removed = removedExisting.has(i);
              return (
                <div key={`existing-${i}`} className="flex flex-col items-center gap-1 w-16">
                  <span className={`${thumbCls} relative ${removed ? "opacity-40" : ""}`}>
                    <ProductImage image={img} className="w-full h-full object-cover flex items-center justify-center text-2xl" />
                    {removed && (
                      <span className="absolute inset-0 flex items-center justify-center bg-white/60 text-[10px] font-semibold text-red-600">
                        entfernt
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] text-[#6b6b76]">vorhanden</span>
                  <button
                    type="button"
                    onClick={() => toggleRemoveExisting(i)}
                    className={`text-[10px] font-medium hover:underline ${removed ? "text-[#6b6b76]" : "text-red-600"}`}
                  >
                    {removed ? "Behalten" : "Entfernen"}
                  </button>
                  {/* Echtes Formularfeld — Serververhalten bleibt unverändert. */}
                  <input
                    type="checkbox"
                    name="removeGalleryIndex"
                    value={i}
                    checked={removed}
                    onChange={() => toggleRemoveExisting(i)}
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden
                  />
                </div>
              );
            })}
            {/* Neu ausgewählte Dateien */}
            {galleryPreviews.map((p, i) => (
              <div key={`${p.url}`} className="flex flex-col items-center gap-1 w-16">
                <span className={`${thumbCls} relative`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeGalleryFile(i)}
                    aria-label={`${p.name} entfernen`}
                    className="absolute top-0.5 right-0.5 bg-white/90 border border-[#e5e5e8] rounded-full p-0.5 text-[#1c1c1f] hover:text-red-600"
                  >
                    <X size={10} />
                  </button>
                </span>
                <span className="text-[10px] text-[#6b6b76] max-w-full truncate" title={p.name}>
                  {p.name}
                </span>
                <span className="text-[10px] text-[#6b6b76]">{formatSize(p.size)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ================= Video ================= */}
      <div className="md:col-span-2 space-y-2 pt-2 border-t border-[#e5e5e8]">
        <span className="block text-xs font-medium text-[#6b6b76]">Produktvideo</span>
        <label className={dropZoneCls} onDragOver={preventDefaults} onDrop={onVideoDrop}>
          <Film size={16} />
          Produktvideo hochladen
          <input
            ref={videoInputRef}
            name="videoFile"
            type="file"
            accept="video/*"
            className="sr-only"
            onChange={(e) => setVideoFromFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <p className={hintCls}>MP4/WebM — max. 20 MB. Ersetzt ein vorhandenes Video.</p>
        {videoError && <p className={warnCls}>{videoError}</p>}

        {videoPreview && videoFileInfo ? (
          <div className="space-y-1">
            <video src={videoPreview} muted controls className="max-w-xs rounded-xl border border-[#e5e5e8]" />
            <div className="flex items-center gap-3">
              <span className="text-xs text-[#6b6b76] min-w-0 truncate">
                {videoFileInfo.name} · {formatSize(videoFileInfo.size)}
              </span>
              <button
                type="button"
                onClick={clearVideo}
                className="text-xs text-red-600 font-medium hover:underline shrink-0"
              >
                Entfernen
              </button>
            </div>
          </div>
        ) : videoUrl ? (
          <div className="space-y-1">
            <video
              src={videoUrl}
              controls
              className={`max-w-xs rounded-xl border border-[#e5e5e8] ${removeExistingVideo ? "opacity-40" : ""}`}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRemoveExistingVideo((v) => !v)}
                className={`text-xs font-medium hover:underline ${removeExistingVideo ? "text-[#6b6b76]" : "text-red-600"}`}
              >
                {removeExistingVideo ? "Video behalten" : "Video entfernen"}
              </button>
              {removeExistingVideo && <span className="text-xs text-red-600">Wird beim Speichern entfernt</span>}
              {/* Echtes Formularfeld — Serververhalten bleibt unverändert. */}
              <input
                type="checkbox"
                name="removeVideo"
                checked={removeExistingVideo}
                onChange={(e) => setRemoveExistingVideo(e.target.checked)}
                className="sr-only"
                tabIndex={-1}
                aria-hidden
              />
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
