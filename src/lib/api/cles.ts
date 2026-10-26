import type { Vote } from "../contracts/feedback";
import type { Niveau } from "../contracts/niveau";

/** Compteur public « annonces vérifiées » : un entier, sans autre donnée. */
export const CLE_COMPTEUR = "compteur:analyses";

/** Un identifiant d'analyse ne permet de voter qu'une fois, et seulement pendant une heure. */
export const DUREE_ID_ANALYSE_S = 3_600;
export const cleAnalyse = (id: string) => `analyse:${id}`;

/** Agrégat du feedback : un compteur par (niveau, tranche de score, vote). Sans durée de vie. */
export const cleFeedback = (niveau: Niveau, tranche: number, vote: Vote) =>
  `feedback:${niveau}:${tranche}:${vote}`;
