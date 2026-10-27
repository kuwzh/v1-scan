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

  // Un lien d'annonce qu'on ne sait pas encore lire n'est pas une panne : ton neutre.
  const information = erreur.code === "lien_non_recuperable";
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className={`mt-6 rounded-2xl border p-4 outline-none ${
        information
          ? "border-neutral-300 bg-neutral-100 text-neutral-950 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
          : "border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100"
      }`}
    >
      <p className="font-semibold">{information ? fr.lienAnnonce.titre : fr.ui.erreur.titre}</p>
      <p className="mt-1">{erreur.message}</p>
      {erreur.diagnostic && (
        <p className="mt-3 border-t border-current/20 pt-3 text-sm">
          <span className="font-semibold">{fr.ui.diagnostic}</span> {erreur.diagnostic}
        </p>
      )}
      {erreur.proposerTexte && (
        <button
          type="button"
          onClick={onCollerTexte}
          className="mt-3 h-11 rounded-xl bg-neutral-900 px-4 font-medium text-white hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-white"
        >
          {fr.ui.erreur.collerTexte}
        </button>
      )}
    </div>
  );
}
