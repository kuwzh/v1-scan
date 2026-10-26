import { SEUIL_ELEVE } from "../contracts/niveau";
import type { Gravite } from "../contracts/signals";
import type { Constat } from "./types";

/**
 * Pondération des signaux. Le score des règles cumule les poids comme des probabilités
 * indépendantes : `100 × (1 − ∏(1 − poids))`. Il reste donc sous 100, les signaux
 * s'additionnent sans s'emballer, et chaque signal garde un effet explicable.
 *
 * Chaque gravité a sa bande de poids : un signal « attention » ne peut pas peser autant
 * qu'un signal « importante ». Les tests vérifient que toutes les règles la respectent.
 */
export const BANDES_POIDS: Readonly<Record<Gravite, readonly [min: number, max: number]>> = {
  info: [0, 0.12],
  attention: [0.12, 0.3],
  importante: [0.3, 0.55],
  critique: [0.55, 1],
};

/** Plancher d'un signal critique quand la règle n'en précise pas. */
export const PLANCHER_CRITIQUE = 70;

/** Plancher des signaux critiques venant de l'analyse de liens. */
export const PLANCHER_LIEN_CRITIQUE = 75;

/** Poids d'un signal de lien selon sa gravité. */
export const POIDS_LIEN: Readonly<Record<Gravite, number>> = {
  info: 0.05,
  attention: 0.18,
  importante: 0.36,
  critique: 0.7,
};

/** Les rassurants retirent au plus ce nombre de points au score. */
export const REMISE_MAX = 10;

// Un plancher critique doit toujours placer le score dans le niveau « élevé ».
if (PLANCHER_CRITIQUE < SEUIL_ELEVE || PLANCHER_LIEN_CRITIQUE < SEUIL_ELEVE) {
  throw new Error("Les planchers critiques doivent atteindre le niveau « élevé ».");
}

interface OptionsConstat {
  plancher?: number;
  conseil?: string;
}

/** Fabrique un constat ; un constat critique reçoit le plancher par défaut. */
export function constat(
  id: string,
  label: string,
  gravite: Gravite,
  poids: number,
  options: OptionsConstat = {},
): Constat {
  const c: Constat = { id, label, gravite, poids };
  if (gravite === "critique") c.plancher = options.plancher ?? PLANCHER_CRITIQUE;
  if (options.conseil) c.conseil = options.conseil;
  return c;
}
