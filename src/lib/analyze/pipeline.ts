import type { AiEvaluation } from "../contracts/ai";
import { donneesExtraitesVides } from "../contracts/extracted";
import type { CodeErreur } from "../contracts/errors";
import type { AnalysisResult } from "../contracts/result";
import { donneesVides } from "../ai/normaliser";
import type { AvertissementsIa, EvaluerIa, ImageEntree, RaisonEchecIa, UsageIa } from "../ai/types";
import { analyserLiens } from "../links/analyse";
import type { LienAnalyse } from "../links/types";
import { collecterLiensBruts } from "../rules/contexte";
import { evaluerRegles } from "../rules/moteur";
import { assemblerResultat } from "./assembler";

export interface DemandeAnalyse {
  /** Captures déjà validées et compressées. */
  images: readonly ImageEntree[];
  /** Texte collé (conversation, annonce). */
  texte?: string | null;
  /** Lien collé : une annonce, ou un lien reçu d'un vendeur. */
  lien?: string | null;
}

export interface DependancesPipeline {
  /** `null` : pas de clé d'API configurée, on n'utilise que les règles. */
  evaluerIa: EvaluerIa | null;
  /** Injectable pour les tests ; sert à la date du jour donnée à l'IA. */
  maintenant?: () => Date;
}

/** Ce qui s'est passé du côté de l'IA, sans aucun contenu : utile aux mesures et à l'éval. */
export type SuiviIa =
  | {
      statut: "ok";
      modele: string;
      dureeMs: number;
      usage: UsageIa;
      avertissements: AvertissementsIa;
    }
  | { statut: "echec"; raison: RaisonEchecIa; detail?: string; dureeMs: number; usage?: UsageIa }
  | { statut: "absente"; motif: "non_configuree" | "non_necessaire" };

export type ResultatDemande =
  | {
      ok: true;
      resultat: AnalysisResult;
      ia: SuiviIa;
      liens: LienAnalyse[];
      /** Données lues que les règles n'ont pas utilisées (confiance basse). */
      ignorees: string[];
    }
  | { ok: false; code: CodeErreur; ia?: SuiviIa };

function dateIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Enchaîne une demande d'analyse : lecture par l'IA (captures, texte), analyse des liens,
 * règles, fusion.
 *
 * - Sans IA ou si elle échoue, un texte collé suffit pour une analyse « règles seules » ; des
 *   captures seules ne peuvent pas être lues sans elle.
 * - Quand l'IA a séparé les messages par auteur, les règles ne lisent QUE ces messages : le
 *   texte brut (qui contient aussi ce que dit l'acheteur) ne leur est pas transmis.
 * - Un lien seul est analysé statiquement. S'il n'a rien de suspect, on ne peut rien en dire
 *   sans le contenu de l'annonce : on demande une capture.
 */
export async function analyserDemande(
  demande: DemandeAnalyse,
  deps: DependancesPipeline,
): Promise<ResultatDemande> {
  const texte = demande.texte?.trim() || null;
  const lien = demande.lien?.trim() || null;
  const aDuContenu = demande.images.length > 0 || texte !== null;
  if (!aDuContenu && lien === null) return { ok: false, code: "entree_invalide" };

  let evaluation: AiEvaluation | null = null;
  let suivi: SuiviIa = {
    statut: "absente",
    motif: aDuContenu ? "non_configuree" : "non_necessaire",
  };

  if (aDuContenu && deps.evaluerIa) {
    const maintenant = (deps.maintenant ?? (() => new Date()))();
    const r = await deps.evaluerIa({
      images: demande.images,
      texte,
      aujourdhui: dateIso(maintenant),
    });
    if (r.ok) {
      suivi = {
        statut: "ok",
        modele: r.modele,
        dureeMs: r.dureeMs,
        usage: r.usage,
        avertissements: r.avertissements,
      };
      if (!r.evaluation.contenu_exploitable || donneesVides(r.evaluation.donnees_extraites)) {
        return { ok: false, code: "analyse_impossible", ia: suivi };
      }
      evaluation = r.evaluation;
    } else {
      suivi = {
        statut: "echec",
        raison: r.raison,
        ...(r.detail ? { detail: r.detail } : {}),
        dureeMs: r.dureeMs,
        ...(r.usage ? { usage: r.usage } : {}),
      };
    }
  }

  // Des captures sans IA ne se lisent pas ; un texte, si.
  if (evaluation === null && texte === null && demande.images.length > 0) {
    return { ok: false, code: "ia_indisponible", ia: suivi };
  }

  const donnees = evaluation ? evaluation.donnees_extraites : donneesExtraitesVides();
  // Texte brut seulement faute de mieux : sinon on perdrait la séparation des auteurs.
  const texteBrut = evaluation ? null : texte;

  const bruts = collecterLiensBruts(donnees, texteBrut);
  if (lien !== null) bruts.push(lien);
  const liens = analyserLiens(bruts);

  if (!aDuContenu) {
    const suspect = liens.some((l) => l.verdict === "suspect");
    if (!suspect) return { ok: false, code: "lien_non_recuperable", ia: suivi };
  }

  const regles = evaluerRegles({ donnees, texte: texteBrut, liens });
  const resultat = assemblerResultat({ donnees, regles, ia: evaluation });
  return { ok: true, resultat, ia: suivi, liens, ignorees: regles.ignorees };
}
