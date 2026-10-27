"use client";

import { useEffect, useState } from "react";
import type { Niveau } from "@/lib/contracts/niveau";
import { fr } from "@/lib/copy/fr";

const COULEUR: Record<Niveau, string> = {
  faible: "var(--color-risk-low)",
  moyen: "var(--color-risk-mid)",
  élevé: "var(--color-risk-high)",
};

// Les trois zones suivent les seuils du score (0–29, 30–59, 60–100), avec un petit espace entre elles.
const ZONES: ReadonlyArray<{ niveau: Niveau; motif: string }> = [
  { niveau: "faible", motif: "29 100" },
  { niveau: "moyen", motif: "0 31 28 100" },
  { niveau: "élevé", motif: "0 61 39 100" },
];

const ARC = "M 20 100 A 80 80 0 0 1 180 100";

/** Demi-cercle gradué en trois zones, avec un repère à la position du score. */
export function Jauge({ score, niveau }: { score: number; niveau: Niveau }) {
  // Le repère part de la gauche puis glisse jusqu'au score (sans animation si l'utilisateur la réduit).
  const [monte, setMonte] = useState(false);
  useEffect(() => {
    const trame = requestAnimationFrame(() => setMonte(true));
    return () => cancelAnimationFrame(trame);
  }, []);
  const angle = monte ? Math.max(0, Math.min(100, score)) * 1.8 : 0;

  return (
    <div
      role="img"
      aria-label={fr.ui.resultat.scoreLu(score, fr.niveaux[niveau].titre)}
      className="relative mx-auto w-full max-w-72"
    >
      <svg viewBox="0 0 200 112" className="w-full overflow-visible" aria-hidden="true">
        {ZONES.map((zone) => (
          <path
            key={zone.niveau}
            d={ARC}
            pathLength={100}
            fill="none"
            strokeWidth={16}
            strokeDasharray={zone.motif}
            style={{ stroke: COULEUR[zone.niveau] }}
            opacity={zone.niveau === niveau ? 1 : 0.28}
          />
        ))}
        <g
          className="motion-reduce:transition-none"
          style={{
            transformOrigin: "100px 100px",
            transform: `rotate(${angle}deg)`,
            transition: "transform 900ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          <circle
            cx={20}
            cy={100}
            r={11}
            strokeWidth={5}
            className="fill-white dark:fill-neutral-900"
            style={{ stroke: COULEUR[niveau] }}
          />
        </g>
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center leading-none">
        <span className="text-5xl font-bold tabular-nums">{score}</span>
        <span className="mt-1 block text-xs text-neutral-600 dark:text-neutral-400">
          {fr.ui.resultat.sur100}
        </span>
      </div>
    </div>
  );
}
