"use client";

import { useState, useTransition } from "react";
import { spinWheel } from "@/lib/actions";
import { PartyPopper, RefreshCw, Hourglass } from "lucide-react";

// Muss zur Segment-Reihenfolge in spinWheel (actions.ts) passen.
const SEGMENTS = ["5", "10", "15", "20", "25", "50", "Niete", "100"];
const SEGMENT_COLORS = [
  "#ff5a1f",
  "#f7f7f8",
  "#ffb08a",
  "#f7f7f8",
  "#ff5a1f",
  "#1faa59",
  "#e5e5e8",
  "#ffd700",
];
const TEXT_COLORS = ["#ffffff", "#1c1c1f", "#1c1c1f", "#1c1c1f", "#ffffff", "#ffffff", "#6b6b76", "#1c1c1f"];

const SEG_ANGLE = 360 / SEGMENTS.length;
const SPIN_MS = 3200;

function segmentPath(i: number): string {
  const r = 92;
  const a0 = ((i * SEG_ANGLE - 90) * Math.PI) / 180;
  const a1 = (((i + 1) * SEG_ANGLE - 90) * Math.PI) / 180;
  const x0 = 100 + r * Math.cos(a0);
  const y0 = 100 + r * Math.sin(a0);
  const x1 = 100 + r * Math.cos(a1);
  const y1 = 100 + r * Math.sin(a1);
  return `M100,100 L${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 0 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z`;
}

function labelPos(i: number) {
  const mid = (((i + 0.5) * SEG_ANGLE - 90) * Math.PI) / 180;
  return { x: 100 + 62 * Math.cos(mid), y: 100 + 62 * Math.sin(mid) };
}

export default function LuckyWheel({ alreadySpun }: { alreadySpun: boolean }) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const [done, setDone] = useState(alreadySpun);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const spin = () => {
    if (spinning || done) return;
    setError(null);
    setSpinning(true);
    startTransition(async () => {
      try {
        const { prize, segmentIndex } = await spinWheel();
        // Ziel: Segment-Mitte oben unter dem Zeiger, plus 5 volle Umdrehungen.
        const target = 5 * 360 + (360 - (segmentIndex * SEG_ANGLE + SEG_ANGLE / 2));
        setRotation((prev) => prev + target - (prev % 360));
        setTimeout(() => {
          setResult(prize);
          setSpinning(false);
          setDone(true);
        }, SPIN_MS);
      } catch (e) {
        setSpinning(false);
        setError(e instanceof Error ? e.message : "Etwas ist schiefgelaufen.");
      }
    });
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-56 h-56">
        {/* Zeiger oben */}
        <div className="absolute left-1/2 -top-1 -translate-x-1/2 z-10 w-0 h-0 border-l-8 border-r-8 border-t-[14px] border-l-transparent border-r-transparent border-t-[#1c1c1f]" />
        <svg
          viewBox="0 0 200 200"
          className="w-full h-full drop-shadow-sm"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.15, 0.6, 0.25, 1)` : "none",
          }}
        >
          <circle cx="100" cy="100" r="96" fill="#ffffff" stroke="#e5e5e8" strokeWidth="2" />
          {SEGMENTS.map((label, i) => {
            const pos = labelPos(i);
            return (
              <g key={i}>
                <path d={segmentPath(i)} fill={SEGMENT_COLORS[i]} stroke="#ffffff" strokeWidth="1.5" />
                <text
                  x={pos.x}
                  y={pos.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={label === "Niete" ? 10 : 13}
                  fontWeight="bold"
                  fill={TEXT_COLORS[i]}
                  transform={`rotate(${(i + 0.5) * SEG_ANGLE}, ${pos.x}, ${pos.y})`}
                >
                  {label}
                </text>
              </g>
            );
          })}
          <circle cx="100" cy="100" r="16" fill="#1c1c1f" />
          <circle cx="100" cy="100" r="6" fill="#ff5a1f" />
        </svg>
      </div>

      {result !== null && !spinning && (
        <p className="text-center font-bold flex items-center gap-2">
          {result > 0 ? (
            <>
              <PartyPopper size={18} className="text-[#ff5a1f]" />
              <span className="text-[#1faa59]">+{result} Coins gewonnen!</span>
            </>
          ) : (
            <span className="text-[#6b6b76]">Leider eine Niete — morgen klappt&apos;s bestimmt!</span>
          )}
        </p>
      )}
      {error && <p className="text-sm text-red-500 text-center">{error}</p>}

      {done && !spinning ? (
        <p className="text-sm text-[#6b6b76] flex items-center gap-1.5">
          <Hourglass size={14} /> {result !== null ? "Das war dein Dreh für heute." : "Heute schon gedreht —"} Komm morgen wieder!
        </p>
      ) : (
        <button
          onClick={spin}
          disabled={spinning}
          className="w-full bg-[#ff5a1f] text-white font-bold py-3 rounded-lg glow-accent hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
        >
          <RefreshCw size={18} className={spinning ? "animate-spin" : ""} />
          {spinning ? "Dreht sich..." : "Jetzt drehen (gratis)"}
        </button>
      )}
    </div>
  );
}
