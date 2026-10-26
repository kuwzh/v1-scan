/**
 * Garde-fou de wording : on parle de « risque » et de « signaux d'alerte », jamais
 * d'accusation contre une personne, ni de certitude ou de garantie.
 *
 * Sert aux tests des textes et des libellés de règles, et à filtrer la sortie de l'IA.
 */
const MOTIFS_INTERDITS: readonly RegExp[] = [
  // Qualifier une personne
  /\barnaqueur/i,
  /\bescroc/i,
  /\bfraudeur/i,
  /\bvoleu[rs]e?s?\b/i,
  /\bbrouteur/i,
  // Affirmer une certitude
  /\bcontrefa[cç]ons?\s+av[ée]r[ée]e/i,
  /\bc['’]est\s+(?:bien\s+|clairement\s+|forcément\s+)?(?:une?\s+)?(?:arnaque|escroquerie)\b/i,
  /\best\s+(?:bien\s+|clairement\s+)?(?:une?\s+)?(?:arnaque|escroquerie)\b/i,
  // Promettre une sécurité
  /\b(?:aucun|zéro)\s+risque\b/i,
  /\b100\s?%\s?(?:sûr|sure|fiable|sécuris)/i,
];

/** Renvoie les extraits problématiques trouvés dans `texte` (liste vide si tout va bien). */
export function trouverFormulationsInterdites(texte: string): string[] {
  const trouvees: string[] = [];
  for (const motif of MOTIFS_INTERDITS) {
    const m = texte.match(motif);
    if (m) trouvees.push(m[0]);
  }
  return trouvees;
}

export function contientFormulationInterdite(texte: string): boolean {
  return trouverFormulationsInterdites(texte).length > 0;
}
