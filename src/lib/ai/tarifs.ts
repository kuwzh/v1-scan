import type { UsageIa } from "./types";

/**
 * Tarifs en dollars par million de jetons (entrée, sortie), tels que publiés. Haiku 5.5 : tarif
 * des requêtes de moins de 100 000 jetons. Sert à estimer le coût d'une évaluation ; à
 * revérifier sur la page de tarifs d'Anthropic avant de s'y fier pour un budget.
 */
export const TARIFS_MODELES: Readonly<Record<string, { entree: number; sortie: number }>> = {
  "claude-haiku-5-5": { entree: 0.1, sortie: 0.5 },
  "claude-sonnet-5-5": { entree: 2, sortie: 10 },
  "claude-opus-5-5": { entree: 4, sortie: 20 },
};

/** Lecture du cache de prompt facturée à ~10 % de l'entrée, écriture à ~125 %. */
const FACTEUR_LECTURE_CACHE = 0.1;
const FACTEUR_ECRITURE_CACHE = 1.25;

/** Coût estimé en dollars, ou `null` si le modèle n'a pas de tarif connu. */
export function estimerCout(modele: string, usage: UsageIa): number | null {
  const tarif = TARIFS_MODELES[modele];
  if (!tarif) return null;
  const entree =
    usage.entree +
    usage.cacheLecture * FACTEUR_LECTURE_CACHE +
    usage.cacheEcriture * FACTEUR_ECRITURE_CACHE;
  return (entree * tarif.entree + usage.sortie * tarif.sortie) / 1_000_000;
}
