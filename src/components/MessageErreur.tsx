"use client";

import { useEffect, useRef } from "react";
import type { ErreurAffichee } from "@/lib/client/api";
import { fr } from "@/lib/copy/fr";

/** Annoncé aux lecteurs d'écran et ramené à l'écran dès qu'il apparaît. */
export function MessageErreur({
  erreur,
  onCollerTexte,
}: {
  erreur: ErreurAffichee;
  onCollerTexte: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.scrollIntoView({ block: "nearest" });
  }, [erreur]);

  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="mt-6 rounded-2xl border border-red-300 bg-red-50 p-4 text-red-950 outline-none dark:border-red-800 dark:bg-red-950/50 dark:text-red-100"
    >
      <p className="font-semibold">{fr.ui.erreur.titre}</p>
      <p className="mt-1">{erreur.message}</p>
      {erreur.proposerTexte && (
        <button
          type="button"
          onClick={onCollerTexte}
          className="mt-3 h-11 rounded-xl bg-red-900 px-4 font-medium text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-900 dark:bg-red-200 dark:text-red-950 dark:hover:bg-red-100"
        >
          {fr.ui.erreur.collerTexte}
        </button>
      )}
    </div>
  );
}
