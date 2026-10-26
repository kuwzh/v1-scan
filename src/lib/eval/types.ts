import type { CodeErreur } from "../contracts/errors";
import type { Confiance, Plateforme } from "../contracts/extracted";
import type { Niveau } from "../contracts/niveau";
import type { AnalysisResult } from "../contracts/result";
import type { SuiviIa } from "../analyze/pipeline";

export type Auteur = "vendeur" | "acheteur" | "inconnu";

/** Ce qu'on attend de la lecture d'un cas. `null` veut dire « doit rester null » (rien d'inventé). */
export interface AttenduExtraction {
  plateforme?: Plateforme | null;
  annonce?: {
    /** Extrait attendu du titre (comparaison sans accents ni casse), ou null. */
    titre?: string | null;
    prix_eur?: number | null;
    marque?: string | null;
    nombre_photos?: number | null;
  };
  vendeur?: {
    anciennete_jours?: { valeur: number; tolerance: number } | null;
    nombre_avis?: number | null;
    note_sur_5?: number | null;
    profil_verifie?: boolean | null;
    nombre_annonces?: number | null;
  };
  /** Auteur attendu de chaque message, retrouvé par un extrait de son texte. */
  messages?: Array<{ contient: string; auteur: Auteur }>;
  /** Extraits qui ne doivent figurer dans aucun message extrait (invention). */
  messagesInterdits?: string[];
}

export interface CasEval {
  id: string;
  categorie: "sain" | "suspect";
  /**
   * Sains : « ordinaire », ou « piege » (ressemble à une arnaque sans en être une : négations,
   * conseils de sécurité, liens officiels…). Suspects : « critique » ou « moyen ».
   */
  groupe: string;
  description: string;
  entree: { texte?: string; images?: string[] };
  /** Ce cas ne peut être jugé correctement qu'avec l'IA (séparation des auteurs, lecture d'image). */
  exigeIa?: boolean;
  attendu: {
    /** Sains : niveau maximal toléré. */
    niveauMax?: Niveau;
    /** Suspects : niveau minimal attendu. */
    niveauMin?: Niveau;
    signauxAttendus?: string[];
    signauxInterdits?: string[];
    extraction?: AttenduExtraction;
  };
}

export interface SortieCas {
  cas: CasEval;
  repetition: number;
  statut: "analyse" | "erreur" | "ignore";
  erreur?: CodeErreur;
  resultat?: AnalysisResult;
  ia?: SuiviIa;
  ignorees?: string[];
}

export interface StatTaux {
  /** Effectif concerné. */
  k: number;
  n: number;
  taux: number;
  /** Intervalle de confiance à 95 % (Wilson). */
  bas: number;
  haut: number;
}

export type IssueChamp = "correct" | "faux" | "manquant" | "invention" | "correct_null";

export interface ChampCompare {
  champ: string;
  attendu: unknown;
  obtenu: unknown;
  confiance: Confiance | null;
  issue: IssueChamp;
}

export interface AuteurCompare {
  contient: string;
  attendu: Auteur;
  obtenu: Auteur | null;
  issue: "correct" | "faux" | "manquant";
}
