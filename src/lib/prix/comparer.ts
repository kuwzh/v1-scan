import type { ComparaisonPrix, EstimationPrix } from "../contracts/prix";
import { fr } from "../copy/fr";
import type { Gravite, Signal } from "../contracts/signals";

/**
 * Seuils lus sur le prix de l'annonce rapporté au BAS de la fourchette d'occasion estimée :
 * - moins de 40 % → « importante » ;
 * - de 40 à 60 % (bornes comprises) → « attention » ;
 * - au-delà, aucun signal.
 * Jamais « critique » : un prix bas peut venir d'un article abîmé, incomplet ou mal identifié, et
 * l'estimation elle-même peut se tromper. Seul un signal critique impose un plancher au score.
 */
export const SEUIL_TRES_BAS_PCT = 40;
export const SEUIL_BAS_PCT = 60;

/** Même poids que le signal de la table de prix (`rules/prix.ts`), dans la bande de chaque gravité. */
export const POIDS_PRIX_WEB: Readonly<Record<"importante" | "attention", number>> = {
  importante: 0.38,
  attention: 0.22,
};

export type GravitePrix = keyof typeof POIDS_PRIX_WEB;

/** Gravité d'un prix : comparaisons entre entiers de pourcentages, sans arrondi flottant. */
export function gravitePourPrix(
  prixAnnonceEur: number,
  occasionMinEur: number,
): GravitePrix | null {
  if (!(occasionMinEur > 0) || !(prixAnnonceEur >= 0)) return null;
  if (prixAnnonceEur * 100 < occasionMinEur * SEUIL_TRES_BAS_PCT) return "importante";
  if (prixAnnonceEur * 100 <= occasionMinEur * SEUIL_BAS_PCT) return "attention";
  return null;
}

/**
 * Compare le prix de l'annonce à l'estimation. `null` si l'estimation n'a pas de fourchette
 * d'occasion (rien à comparer). Une comparaison « non fiable » (confiance basse, aucune source)
 * s'affiche mais ne produit aucun signal.
 */
export function comparerPrix(
  prixAnnonceEur: number,
  estimation: EstimationPrix,
): ComparaisonPrix | null {
  const { occasion_min_eur: min, occasion_max_eur: max } = estimation;
  if (min === null || max === null || !(prixAnnonceEur >= 0)) return null;
  const habituel = (min + max) / 2;
  return {
    prix_annonce_eur: prixAnnonceEur,
    occasion_habituelle_eur: Math.round(habituel * 100) / 100,
    ecart_pct: Math.round((prixAnnonceEur / habituel - 1) * 100),
    part_du_bas_pct: Math.round((prixAnnonceEur / min) * 100),
    fiable: estimation.confiance !== "basse" && estimation.sources.length > 0,
  };
}

export interface SignalPrix {
  signal: Signal;
  poids: number;
  conseil: string;
}

/** Signal de risque tiré de la comparaison, ou `null` (prix normal, ou estimation peu sûre). */
export function signalPourPrix(
  prixAnnonceEur: number,
  estimation: EstimationPrix,
  comparaison: ComparaisonPrix | null,
): SignalPrix | null {
  if (!comparaison?.fiable || estimation.occasion_min_eur === null) return null;
  const gravite = gravitePourPrix(prixAnnonceEur, estimation.occasion_min_eur);
  if (gravite === null) return null;
  return {
    signal: {
      id: "prix.web",
      label: gravite === "importante" ? fr.regles.prixWeb.tresBas : fr.regles.prixWeb.bas,
      gravite: gravite satisfies Gravite,
      source: "regle",
    },
    poids: POIDS_PRIX_WEB[gravite],
    conseil: fr.conseilsRegles.prixBas,
  };
}
