import type { Segment } from "./types";

/** Minuscules, sans accents, apostrophes droites, espaces réguliers. */
export function normaliserTexte(texte: string): string {
  return texte
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[’‘´`]/g, "'")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[  ]/g, " ")
    .replace(/[ \t]+/g, " ");
}

/**
 * Négation collée à ce qu'elle nie : un mot de négation suivi d'au plus trois mots, puis le
 * passage cherché (« pas de virement », « jamais le code », « ni de PayPal »). Au-delà, on
 * considère que la négation porte sur autre chose (« pas de souci, je fais un virement »).
 *
 * Volontairement absents : « n'accepte » (« je n'accepte que le mandat cash » est une
 * demande), « éviter » (« pour éviter les frais, virement »), et « sans » n'est retenu que
 * collé (« sans virement », mais pas « sans problème je fais un virement »).
 */
const NEGATION_AVANT =
  /\b(?:pas|ni|sans|jamais|aucun|aucune|refuse|refusons|interdit|interdite|inutile)\b(?:\s+[^\s.!?;:,()]+){0,3}\s*$/;
const NEGATION_APRES =
  /^[^.!?;,\n()]{0,25}\b(?:non accepte|pas accepte|pas possible|impossible|n'est pas|ne sont pas|refuse)\b/;

/**
 * Le passage `[debut, fin[` est-il nié (« pas de virement », « je n'accepte pas PayPal ») ?
 * Une virgule, un point ou un deux-points coupent la proposition : « pas de souci, je fais un
 * virement » n'est donc pas nié.
 */
export function estNie(norm: string, debut: number, fin: number): boolean {
  const avant = norm.slice(Math.max(0, debut - 60), debut);
  if (NEGATION_AVANT.test(avant)) return true;
  return NEGATION_APRES.test(norm.slice(fin, fin + 40));
}

/**
 * Un verbe de demande est-il nié (« ne communique jamais », « ne donnez pas ») ? Sert aux
 * conseils de sécurité du type « ne communiquez jamais à personne votre code reçu par SMS ».
 */
export function verbeNie(norm: string, debut: number, fin: number): boolean {
  const avant = norm.slice(Math.max(0, debut - 6), debut);
  const apres = norm.slice(fin, fin + 12);
  return /\bne\s+$|\bn'$/.test(avant) || /^\s+(?:jamais|pas|plus)\b/.test(apres);
}

export interface Trouvaille {
  /** Passage trouvé (texte normalisé). */
  extrait: string;
  segment: Segment;
  debut: number;
  fin: number;
}

export interface OptionsRecherche {
  /** Ne pas écarter les passages niés. */
  ignorerNegation?: boolean;
}

function globale(motif: RegExp): RegExp {
  return motif.global ? motif : new RegExp(motif.source, `${motif.flags}g`);
}

/** Toutes les occurrences de `motif` dans `segments`, sauf celles qui sont niées. */
export function chercherTous(
  segments: readonly Segment[],
  motif: RegExp,
  options: OptionsRecherche = {},
): Trouvaille[] {
  const trouvees: Trouvaille[] = [];
  const re = globale(motif);
  for (const segment of segments) {
    for (const m of segment.norm.matchAll(re)) {
      const debut = m.index ?? 0;
      const fin = debut + m[0].length;
      if (!options.ignorerNegation && estNie(segment.norm, debut, fin)) continue;
      trouvees.push({ extrait: m[0], segment, debut, fin });
    }
  }
  return trouvees;
}

export function chercher(
  segments: readonly Segment[],
  motif: RegExp,
  options: OptionsRecherche = {},
): Trouvaille | null {
  return chercherTous(segments, motif, options)[0] ?? null;
}

export function existe(
  segments: readonly Segment[],
  motif: RegExp,
  options: OptionsRecherche = {},
): boolean {
  return chercher(segments, motif, options) !== null;
}

/** Texte normalisé autour d'une trouvaille. */
export function autour(t: Trouvaille, avant = 60, apres = 80): string {
  return t.segment.norm.slice(Math.max(0, t.debut - avant), t.fin + apres);
}

/**
 * Y a-t-il, près de `trouve`, un verbe de demande qui n'est pas nié ? (« envoie-moi le code »
 * oui ; « ne communique jamais ton code » non.)
 */
export function demandeAutour(trouve: Trouvaille, verbes: RegExp, avant = 70, apres = 70): boolean {
  const norm = trouve.segment.norm;
  const debut = Math.max(0, trouve.debut - avant);
  const fenetre = norm.slice(debut, trouve.fin + apres);
  for (const m of fenetre.matchAll(globale(verbes))) {
    const d = debut + (m.index ?? 0);
    if (!verbeNie(norm, d, d + m[0].length)) return true;
  }
  return false;
}
