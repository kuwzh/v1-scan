import type { ExtractedData, Plateforme } from "../contracts/extracted";
import type { Gravite, Rassurant, Signal } from "../contracts/signals";
import type { LienAnalyse } from "../links/types";

export interface EntreeRegles {
  donnees: ExtractedData;
  /** Texte brut collé par l'utilisateur (conversation, annonce), s'il y en a un. */
  texte?: string | null;
  /** Liens déjà analysés. `collecterLiensBruts` donne la liste à passer à `analyserLiens`. */
  liens: readonly LienAnalyse[];
}

export interface Segment {
  source: "description" | "message" | "texte";
  /** Les messages de l'acheteur (l'utilisateur lui-même) ne sont jamais analysés. */
  auteur: "vendeur" | "inconnu";
  brut: string;
  /** Minuscules, sans accents, apostrophes droites : c'est sur ce texte que portent les motifs. */
  norm: string;
}

export interface Contexte {
  donnees: ExtractedData;
  plateforme: Plateforme | null;
  /** Plateformes où le paiement et la remise se font surtout en direct (Leboncoin, Marketplace). */
  plateformeLocale: boolean;
  /** Description de l'annonce + conversation. */
  segments: readonly Segment[];
  /** Conversation seulement (messages et texte collé) : les demandes ne se lisent que là. */
  messages: readonly Segment[];
  liens: readonly LienAnalyse[];
  /** Liens ni officiels ni connus comme sûrs. */
  liensNonOfficiels: readonly LienAnalyse[];
  /** Liens que l'analyse a jugés suspects (au moins un signal d'alerte). */
  liensSuspects: readonly LienAnalyse[];
}

/** Résultat d'une règle déclenchée, avant agrégation. */
export interface Constat {
  id: string;
  label: string;
  gravite: Gravite;
  /** Poids dans le score, entre 0 et 1 (voir `BANDES_POIDS`). */
  poids: number;
  /** Plancher de score imposé : uniquement pour la gravité « critique ». */
  plancher?: number;
  conseil?: string;
}

/** Élément rassurant produit par une règle, avec sa remise (en points) sur le score. */
export interface Reassurance {
  id: string;
  label: string;
  /** Points retirés du score, dans la limite de `REMISE_MAX`. 0 = affiché sans effet. */
  remise: number;
}

export interface Regle {
  nom: string;
  evaluer(ctx: Contexte): Constat[];
}

export interface RegleRassurante {
  nom: string;
  evaluer(ctx: Contexte, constats: readonly Constat[]): Reassurance[];
}

export interface ResultatRegles {
  /** Score 0–100 des règles, relevé au plancher quand il y a un signal critique. */
  score: number;
  /** Score issu du cumul des signaux, avant relèvement au plancher. */
  scoreBrut: number;
  plancher: number | null;
  /** Points de remise accordés par les rassurants (déjà plafonnés). */
  remise: number;
  /** Du plus grave au moins grave. */
  signaux: Signal[];
  rassurants: Rassurant[];
  /** Conseils des règles déclenchées, les plus pesantes d'abord. */
  conseils: string[];
  /** Détail avec les poids, pour les tests et le diagnostic. */
  constats: Constat[];
}
