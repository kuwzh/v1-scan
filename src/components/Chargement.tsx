"use client";

import { useEffect, useState } from "react";
import { fr } from "@/lib/copy/fr";

const ETAPES = fr.ui.chargement.etapes;

export function Chargement({ onAnnuler }: { onAnnuler: () => void }) {
  const [etape, setEtape] = useState(0);
  useEffect(() => {
    const minuteur = setInterval(() => setEtape((e) => Math.min(e + 1, ETAPES.length - 1)), 3_000);
    return () => clearInterval(minuteur);
  }, []);

  return (
    <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
      <div
        aria-hidden="true"
        className="size-16 animate-spin rounded-full border-4 border-neutral-200 border-t-indigo-600 motion-reduce:animate-pulse dark:border-neutral-800 dark:border-t-indigo-400"
      />
      {/* Annoncé une seule fois ; les messages qui défilent ne le sont pas pour ne pas saturer. */}
      <div role="status" className="mt-8">
        <h1 className="text-2xl font-bold">{fr.ui.chargement.titre}</h1>
      </div>
      <p aria-hidden="true" className="mt-2 min-h-6 text-neutral-700 dark:text-neutral-300">
        {ETAPES[etape]}
      </p>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
        {fr.ui.chargement.patience}
      </p>
      <button
        type="button"
        onClick={onAnnuler}
        className="mt-10 h-12 rounded-xl px-6 font-medium text-neutral-700 underline underline-offset-4 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:text-neutral-300 dark:hover:text-white"
      >
        {fr.ui.chargement.annuler}
      </button>
    </div>
  );
}
