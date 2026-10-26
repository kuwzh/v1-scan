import type { AiEvaluation } from "../contracts/ai";
import type { ACCEPTED_IMAGE_TYPES } from "../contracts/limits";

export type TypeImage = (typeof ACCEPTED_IMAGE_TYPES)[number];

/** Image déjà validée et compressée par l'appelant, encodée en base64 (sans préfixe `data:`). */
export interface ImageEntree {
  mediaType: TypeImage;
  base64: string;
}

export interface EntreeIa {
  images: readonly ImageEntree[];
  /** Texte collé par l'utilisateur (conversation, annonce). */
  texte?: string | null;
  /** Date du jour au format AAAA-MM-JJ : sert à convertir « membre depuis mars 2023 » en jours. */
  aujourdhui: string;
}

export interface UsageIa {
  entree: number;
  sortie: number;
  cacheLecture: number;
  cacheEcriture: number;
}

/** Ce que la couche de nettoyage a écarté ou corrigé dans la réponse de l'IA. */
export interface AvertissementsIa {
  /** Messages absents du texte collé : probablement inventés. */
  messagesEcartes: number;
  /** Liens absents du texte collé : probablement inventés. */
  liensEcartes: number;
  /** Données hors limites ou incohérentes remises à `null` (`vendeur.nombre_avis`…). */
  valeursInvalides: string[];
}

export type RaisonEchecIa =
  /** Réseau, surcharge, limite de débit, erreur du service. */
  | "indisponible"
  /** Clé refusée, modèle inconnu, requête invalide : un problème de configuration. */
  | "configuration"
  | "delai"
  /** Le modèle a refusé de répondre. */
  | "refus"
  /** La réponse a été coupée avant la fin du JSON. */
  | "tronquee"
  /** La réponse n'a pas la forme attendue. */
  | "reponse_invalide";

export type ResultatIa =
  | {
      ok: true;
      evaluation: AiEvaluation;
      avertissements: AvertissementsIa;
      usage: UsageIa;
      dureeMs: number;
      modele: string;
    }
  | {
      ok: false;
      raison: RaisonEchecIa;
      /** Information technique sans aucun contenu de l'utilisateur (classe d'erreur, statut HTTP…). */
      detail?: string;
      dureeMs: number;
      usage?: UsageIa;
    };

export type EvaluerIa = (entree: EntreeIa) => Promise<ResultatIa>;
