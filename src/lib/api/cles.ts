import type { Vote } from "../contracts/feedback";
import type { ModeAnalyse } from "../contracts/result";
import type { Niveau } from "../contracts/niveau";

/** Compteur public « annonces vérifiées » : un entier, sans autre donnée. */
export const CLE_COMPTEUR = "compteur:analyses";

/** Un identifiant d'analyse ne permet de voter qu'une fois, et seulement pendant une heure. */
export const DUREE_ID_ANALYSE_S = 3_600;
export const cleAnalyse = (id: string) => `analyse:${id}`;

/**
 * L'article de l'analyse et de quoi recalculer son score, gardés une heure pour le bouton
 * « Comparer le prix » : nombres et données de produit, ni capture ni conversation.
 */
export const clePrixProduit = (id: string) => `produit:${id}`;

/**
 * Agrégat du feedback : un compteur par (mode, niveau, tranche de score, vote). Sans durée de
 * vie. Le mode (complet / règles seules) est séparé car les deux n'ont pas la même distribution
 * de scores : les mélanger fausserait le calibrage des seuils.
 */
export const cleFeedback = (mode: ModeAnalyse, niveau: Niveau, tranche: number, vote: Vote) =>
  `feedback:${mode}:${niveau}:${tranche}:${vote}`;

/** Ce que le serveur retient sous l'identifiant d'une analyse, pour valider le vote. */
export function encoderAnalyse(mode: ModeAnalyse, tranche: number): string {
  return `${mode}:${tranche}`;
}

export function decoderAnalyse(brut: string | null): { mode: ModeAnalyse; tranche: number } | null {
  const m = /^(complet|regles_seules):(\d{1,2})$/.exec(brut ?? "");
  const tranche = Number(m?.[2]);
  if (!m || tranche % 10 !== 0 || tranche > 90) return null;
  return { mode: m[1] as ModeAnalyse, tranche };
}
