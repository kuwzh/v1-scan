import type { Signal } from "../contracts/signals";

/**
 * - `officiel` : domaine de la liste blanche (ou sous-domaine d'un domaine officiel).
 * - `connu` : domaine répertorié comme sûr, sans marque surveillée (transporteurs, etc.).
 * - `suspect` : au moins un signal d'alerte d'une gravité « attention » ou plus.
 * - `inconnu` : domaine non répertorié, sans signal marquant (ce n'est pas un feu vert).
 * - `illisible` : l'adresse n'a pas pu être interprétée comme un lien http(s).
 */
export type VerdictLien = "officiel" | "connu" | "suspect" | "inconnu" | "illisible";

export interface MarqueVisee {
  id: string;
  nom: string;
}

export interface LienAnalyse {
  /** Texte tel que reçu (tronqué à la longueur maximale d'une URL). */
  entree: string;
  /** Adresse nettoyée, sans aucune substitution de lettres. `null` si illisible. */
  adresse: string | null;
  /** Hôte en ASCII (punycode pour les noms internationaux). */
  hote: string | null;
  /** Domaine enregistrable selon la Public Suffix List. */
  domaine: string | null;
  verdict: VerdictLien;
  /** Marque que le lien semble viser ou imiter, quand il y en a une. */
  marque: MarqueVisee | null;
  /** Signaux d'alerte, du plus grave au moins grave (`source: "regle"`, id `lien.*`). */
  signaux: Signal[];
  /** Nettoyages appliqués à l'entrée (codes), pour le diagnostic. */
  modifications: string[];
}
