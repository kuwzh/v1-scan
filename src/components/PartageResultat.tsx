"use client";

import { useEffect, useRef, useState } from "react";
import { genererImage, partagerImage } from "@/lib/client/partage";
import { fr } from "@/lib/copy/fr";
import type { DonneesCarte } from "@/lib/partage/carte";

const BOUTON =
  "inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-indigo-600 text-lg font-semibold text-indigo-700 transition-colors hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-60 dark:border-indigo-400 dark:text-indigo-300 dark:hover:bg-indigo-950/60";

type Statut = "attente" | "enregistree" | "erreur";

/**
 * « Partager le résultat » : une image 9:16 générée dans le navigateur (canvas), partagée avec la
 * feuille de partage du système, ou enregistrée. L'image est préparée dès que le résultat
 * s'affiche, pour que le clic puisse appeler `share()` aussitôt (Safari l'exige).
 */
export function PartageResultat({ donnees }: { donnees: DonneesCarte }) {
  const [statut, setStatut] = useState<Statut>("attente");
  const [apercu, setApercu] = useState<{ blob: Blob; url: string } | null>(null);
  const image = useRef<{ cle: string; promesse: Promise<Blob> } | null>(null);
  const boite = useRef<HTMLDialogElement>(null);

  // Les données de la carte sont des textes courts : leur sérialisation sert de clé.
  const cle = JSON.stringify(donnees);
  useEffect(() => {
    const promesse = genererImage(JSON.parse(cle) as DonneesCarte);
    image.current = { cle, promesse };
    // Une erreur de génération est traitée au clic ; ici on évite seulement un rejet non géré.
    promesse.catch(() => undefined);
  }, [cle]);

  useEffect(() => {
    const url = apercu?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [apercu?.url]);

  useEffect(() => {
    if (apercu) boite.current?.showModal();
  }, [apercu]);

  async function partager() {
    setStatut("attente");
    const courante = image.current;
    let blob: Blob;
    try {
      blob = await (courante?.cle === cle ? courante.promesse : genererImage(donnees));
    } catch {
      setStatut("erreur");
      return;
    }
    const issue = await partagerImage(blob, { texte: fr.partage.texte(donnees.hote) });
    if (issue === "apercu") setApercu({ blob, url: URL.createObjectURL(blob) });
    else if (issue === "telecharge") setStatut("enregistree");
  }

  function fermer() {
    boite.current?.close();
    setApercu(null);
  }

  return (
    <div>
      <button type="button" className={BOUTON} onClick={() => void partager()}>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
        </svg>
        {fr.partage.bouton}
      </button>
      <p role="status" className="mt-2 min-h-5 text-sm text-neutral-700 dark:text-neutral-300">
        {statut === "enregistree" && fr.partage.statut.enregistree}
      </p>
      {statut === "erreur" && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {fr.partage.statut.erreur}
        </p>
      )}

      <dialog
        ref={boite}
        onClose={() => setApercu(null)}
        aria-labelledby="titre-apercu"
        className="m-auto max-h-[92dvh] w-[min(92vw,28rem)] overflow-y-auto rounded-3xl border border-neutral-300 bg-white p-5 text-neutral-950 backdrop:bg-black/70 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
      >
        {apercu && (
          <div>
            <h2 id="titre-apercu" className="text-lg font-semibold">
              {fr.partage.apercu.titre}
            </h2>
            <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
              {fr.partage.apercu.aide}
            </p>
            {/* Une vraie image : appui long → « Ajouter à Photos » sur iPhone. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={apercu.url}
              alt={fr.partage.apercu.alt}
              width={1080}
              height={1920}
              className="mx-auto mt-4 max-h-[60dvh] w-auto rounded-2xl"
            />
            <button type="button" className={`${BOUTON} mt-4`} onClick={fermer}>
              {fr.partage.apercu.fermer}
            </button>
          </div>
        )}
      </dialog>
    </div>
  );
}
