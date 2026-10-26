import { SEUIL_ELEVE } from "../contracts/niveau";

/** Poids de l'IA dans la moyenne avec les règles. */
export const POIDS_IA = 0.5;

/**
 * Le score final ne descend jamais de plus de cette marge (en points) sous l'avis le plus
 * sévère des deux sources. Un faux négatif coûte plus cher qu'un faux positif : si les
 * règles voient 70 et l'IA 10, on ne tombe pas à 40.
 *
 * Formule continue et monotone (une source plus sévère ne peut jamais faire baisser le
 * résultat), contrairement à un « au-delà d'un écart, on prend le maximum » qui crée une
 * cassure : règles 59 / IA 15 donnaient 59, mais règles 59 / IA 40 donnaient 50.
 */
export const MARGE_PRUDENCE = 10;

export interface EntreeFusion {
  /** Score des règles, déjà relevé au plancher. */
  scoreRegles: number;
  /** `null` quand l'IA n'a pas répondu ou que sa réponse est inutilisable. */
  scoreIa: number | null;
  /** Plancher imposé par les signaux critiques des règles. */
  plancher: number | null;
  /** Points de remise accordés par les rassurants (déjà plafonnés). */
  remise: number;
}

export interface ResultatFusion {
  score: number;
  /** Score avant remise et plancher : moyenne ou maximum, selon l'écart. */
  base: number;
  /** Points réellement retirés par les rassurants. */
  remiseAppliquee: number;
}

function borner(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}

/**
 * Score final = combinaison des règles et de l'IA.
 *
 * 1. Base : la moyenne des deux, sans jamais descendre de plus de `MARGE_PRUDENCE` points
 *    sous la plus sévère. Sans IA, la base est le score des règles.
 * 2. Les rassurants retirent quelques points (`remise`), mais ne font jamais passer un
 *    score de « élevé » à « moyen » : un compte ancien peut être piraté, des avis peuvent
 *    être achetés.
 * 3. Le plancher des signaux critiques passe en dernier : rien ne descend dessous.
 */
export function fusionnerScores(entree: EntreeFusion): ResultatFusion {
  const regles = borner(entree.scoreRegles);
  let base: number;
  if (entree.scoreIa === null) {
    base = regles;
  } else {
    const ia = borner(entree.scoreIa);
    const moyenne = Math.round((1 - POIDS_IA) * regles + POIDS_IA * ia);
    base = Math.max(moyenne, Math.max(regles, ia) - MARGE_PRUDENCE);
  }

  let score = base - Math.max(0, entree.remise);
  if (base >= SEUIL_ELEVE) score = Math.max(score, SEUIL_ELEVE);
  score = borner(Math.max(score, entree.plancher ?? 0));

  return { score, base, remiseAppliquee: Math.max(0, base - score) };
}
