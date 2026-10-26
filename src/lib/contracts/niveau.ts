import { z } from "zod";

export const NIVEAUX = ["faible", "moyen", "élevé"] as const;
export const NiveauSchema = z.enum(NIVEAUX);
export type Niveau = z.infer<typeof NiveauSchema>;

/** Premier score de chaque niveau. Seuils à calibrer sur les fixtures (étape 3). */
export const SEUIL_MOYEN = 30;
export const SEUIL_ELEVE = 60;

export const ScoreSchema = z.number().int().min(0).max(100);

/**
 * Le niveau se déduit toujours du score final, jamais l'inverse : si l'IA renvoie
 * un niveau incohérent avec son score, on ignore le niveau.
 */
export function niveauPourScore(score: number): Niveau {
  if (score >= SEUIL_ELEVE) return "élevé";
  if (score >= SEUIL_MOYEN) return "moyen";
  return "faible";
}

/**
 * Tranche de 10 points servant d'agrégat anonyme pour le feedback : 0, 10, … 90
 * (90 couvre 90 à 100). Évite de stocker un score exact.
 */
export function trancheDeScore(score: number): number {
  return Math.min(90, Math.floor(score / 10) * 10);
}
