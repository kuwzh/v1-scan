"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_IMAGES } from "@/lib/contracts/limits";
import { fr } from "@/lib/copy/fr";
import { ErreurImage, compresserFichier } from "./compression-navigateur";

export interface Capture {
  id: string;
  blob: Blob;
  /** URL locale pour la vignette ; libérée quand la capture est retirée. */
  url: string;
}

/**
 * Captures choisies par l'utilisateur : compressées dès l'ajout (une à la fois, pour ménager la
 * mémoire d'un téléphone), limitées à `MAX_IMAGES`. Les compteurs sont dans des refs pour que
 * deux sélections rapprochées ne dépassent pas la limite.
 */
export function useCaptures() {
  const liste = useRef<Capture[]>([]);
  const enCoursRef = useRef(0);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [enCours, setEnCours] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  const publier = useCallback((suivante: Capture[]) => {
    liste.current = suivante;
    setCaptures(suivante);
  }, []);

  const ajouter = useCallback(
    async (fichiers: readonly File[]) => {
      const places = Math.max(0, MAX_IMAGES - liste.current.length - enCoursRef.current);
      const retenus = fichiers.slice(0, places);
      setMessage(fichiers.length > retenus.length ? fr.ui.captures.tropDImages : null);
      enCoursRef.current += retenus.length;
      setEnCours(enCoursRef.current);

      for (const fichier of retenus) {
        try {
          const blob = await compresserFichier(fichier);
          publier([
            ...liste.current,
            { id: crypto.randomUUID(), blob, url: URL.createObjectURL(blob) },
          ]);
        } catch (e) {
          setMessage(
            e instanceof ErreurImage && e.motif === "trop_lourde"
              ? fr.ui.captures.tropLourde
              : fr.ui.captures.illisible,
          );
        } finally {
          enCoursRef.current -= 1;
          setEnCours(enCoursRef.current);
        }
      }
    },
    [publier],
  );

  const retirer = useCallback(
    (id: string) => {
      const cible = liste.current.find((c) => c.id === id);
      if (cible) URL.revokeObjectURL(cible.url);
      setMessage(null);
      publier(liste.current.filter((c) => c.id !== id));
    },
    [publier],
  );

  const vider = useCallback(() => {
    liste.current.forEach((c) => URL.revokeObjectURL(c.url));
    setMessage(null);
    publier([]);
  }, [publier]);

  useEffect(
    () => () => {
      liste.current.forEach((c) => URL.revokeObjectURL(c.url));
    },
    [],
  );

  return { captures, enCours, message, ajouter, retirer, vider };
}
