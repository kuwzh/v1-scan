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

/**
 * Bornes hautes servant à réserver le plafond de dépense avant l'appel. Une image est réduite par
 * l'API à ~1 568 px de côté au plus (≈ 3 300 jetons) quelle que soit sa taille d'origine ; le
 * prompt système et le schéma pèsent ~2 000 jetons ; le texte est compté à 3 caractères par jeton.
 */
const JETONS_SYSTEME_MAX = 2_000;
const JETONS_PAR_IMAGE_MAX = 3_300;
const CARACTERES_PAR_JETON_MIN = 3;

/**
 * Coût maximal possible d'une évaluation, en dollars : tout le contexte facturé plein tarif
 * (sans cache) et la réponse au maximum de jetons autorisé. Un modèle sans tarif connu est
 * compté au plus cher des tarifs connus : mieux vaut réserver trop que dépasser le plafond.
 */
export function estimerCoutMaximal(
  modele: string,
  entree: { images: number; caracteresTexte: number; maxTokens: number },
): number {
  const tarifs = Object.values(TARIFS_MODELES);
  const tarif =
    TARIFS_MODELES[modele] ??
    tarifs.reduce((a, b) => (b.sortie + b.entree > a.sortie + a.entree ? b : a));
  const jetonsEntree =
    JETONS_SYSTEME_MAX +
    entree.images * JETONS_PAR_IMAGE_MAX +
    Math.ceil(entree.caracteresTexte / CARACTERES_PAR_JETON_MIN);
  return (jetonsEntree * tarif.entree + entree.maxTokens * tarif.sortie) / 1_000_000;
}

/** Tarif publié de l'outil de recherche web : 10 $ les 1 000 recherches, en plus des jetons. */
export const PRIX_RECHERCHE_WEB_USD = 0.01;

/**
 * Les résultats d'une recherche sont comptés en jetons d'entrée, à chaque tour de la boucle
 * serveur : une borne haute pour réserver le plafond de dépense avant l'appel.
 */
const JETONS_ENTREE_RECHERCHE_MAX = 60_000;

export interface UsageRecherche extends UsageIa {
  /** `usage.server_tool_use.web_search_requests`, cumulé sur tous les tours. */
  recherchesWeb: number;
}

/** Coût réel d'une estimation de prix : jetons plus recherches facturées. `null` si le modèle est inconnu. */
export function estimerCoutRecherche(modele: string, usage: UsageRecherche): number | null {
  const jetons = estimerCout(modele, usage);
  return jetons === null ? null : jetons + usage.recherchesWeb * PRIX_RECHERCHE_WEB_USD;
}

/** Coût maximal d'une estimation : toutes les recherches permises, un contexte plein, une réponse maximale. */
export function estimerCoutRechercheMaximal(
  modele: string,
  entree: { maxRecherches: number; maxTokens: number },
): number {
  const tarifs = Object.values(TARIFS_MODELES);
  const tarif =
    TARIFS_MODELES[modele] ??
    tarifs.reduce((a, b) => (b.sortie + b.entree > a.sortie + a.entree ? b : a));
  return (
    entree.maxRecherches * PRIX_RECHERCHE_WEB_USD +
    (JETONS_ENTREE_RECHERCHE_MAX * tarif.entree + entree.maxTokens * tarif.sortie) / 1_000_000
  );
}
