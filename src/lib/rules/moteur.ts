import { rangGravite, type Rassurant, type Signal } from "../contracts/signals";
import { CATALOGUE, CATALOGUE_RASSURANTS } from "./catalog";
import { construireContexte } from "./contexte";
import { PLANCHER_CRITIQUE, REMISE_MAX } from "./poids";
import type { Constat, EntreeRegles, Reassurance, ResultatRegles } from "./types";

/** Un même signal peut venir de plusieurs endroits : on garde le plus pesant. */
function dedupliquer(constats: readonly Constat[]): Constat[] {
  const parId = new Map<string, Constat>();
  for (const c of constats) {
    const existant = parId.get(c.id);
    if (!existant || c.poids > existant.poids) parId.set(c.id, c);
  }
  return [...parId.values()];
}

function trier(constats: Constat[]): Constat[] {
  return constats.sort(
    (a, b) =>
      rangGravite(b.gravite) - rangGravite(a.gravite) ||
      b.poids - a.poids ||
      a.id.localeCompare(b.id),
  );
}

/**
 * Cumul des poids comme des probabilités indépendantes : `100 × (1 − ∏(1 − poids))`.
 * Deux signaux de 0,4 donnent 64, pas 80 ; le résultat ne dépasse jamais 100.
 */
export function cumulerPoids(poids: readonly number[]): number {
  const reste = poids.reduce((p, w) => p * (1 - Math.min(Math.max(w, 0), 0.99)), 1);
  return Math.round(100 * (1 - reste));
}

/**
 * Applique toutes les règles déterministes. Le résultat ne dépend que de l'entrée : même
 * entrée, même score, sans aucun appel réseau ni IA.
 *
 * - Les signaux se cumulent (`cumulerPoids`).
 * - Un signal « critique » impose un plancher : le score ne descend jamais dessous.
 * - Les rassurants issus du profil donnent une remise de quelques points (`REMISE_MAX`),
 *   appliquée plus tard à la fusion avec l'IA, jamais sous le plancher.
 */
export function evaluerRegles(entree: EntreeRegles): ResultatRegles {
  const ctx = construireContexte(entree);
  const constats = trier(dedupliquer(CATALOGUE.flatMap((regle) => regle.evaluer(ctx))));

  const scoreBrut = cumulerPoids(constats.map((c) => c.poids));
  const planchers = constats
    .filter((c) => c.gravite === "critique")
    .map((c) => c.plancher ?? PLANCHER_CRITIQUE);
  const plancher = planchers.length > 0 ? Math.max(...planchers) : null;

  const reassurances = new Map<string, Reassurance>();
  for (const regle of CATALOGUE_RASSURANTS) {
    for (const r of regle.evaluer(ctx, constats)) reassurances.set(r.id, r);
  }
  const remise = Math.min(
    REMISE_MAX,
    [...reassurances.values()].reduce((somme, r) => somme + r.remise, 0),
  );

  const signaux: Signal[] = constats.map((c) => ({
    id: c.id,
    label: c.label,
    gravite: c.gravite,
    source: "regle",
  }));
  const rassurants: Rassurant[] = [...reassurances.values()].map((r) => ({
    id: r.id,
    label: r.label,
    source: "regle",
  }));
  const conseils = [...new Set(constats.flatMap((c) => (c.conseil ? [c.conseil] : [])))];

  return {
    score: Math.max(scoreBrut, plancher ?? 0),
    scoreBrut,
    plancher,
    remise,
    signaux,
    rassurants,
    conseils,
    constats,
  };
}
