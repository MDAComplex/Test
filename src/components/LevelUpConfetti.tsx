"use client";

import { useEffect, useState } from "react";

const COLORS = ["#ff5a1f", "#1faa59", "#ffd166", "#7c5cff", "#ff6b6b"];

export default function LevelUpConfetti({ rank }: { rank: string }) {
  const [pieces] = useState(() =>
    Array.from({ length: 80 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      color: COLORS[i % COLORS.length],
      rotate: Math.random() * 360,
    }))
  );
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 3500);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-0 w-2 h-3 rounded-sm confetti-piece"
          style={{
            left: `${p.left}%`,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-white border border-[#ff5a1f]/60 rounded-2xl px-6 py-4 text-center glow-accent animate-pop">
        <p className="text-3xl">🎉</p>
        <p className="font-extrabold text-lg mt-1 text-[#1c1c1f]">Level Up!</p>
        <p className="text-sm text-[#6b6b76]">Du bist jetzt {rank}</p>
      </div>
      <style jsx>{`
        .confetti-piece {
          animation: confetti-fall 2.8s ease-in forwards;
        }
        @keyframes confetti-fall {
          0% {
            top: -5%;
            opacity: 1;
          }
          100% {
            top: 105%;
            opacity: 0.8;
          }
        }
      `}</style>
    </div>
  );
}
