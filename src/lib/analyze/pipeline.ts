import type { AiEvaluation } from "../contracts/ai";
import { donneesExtraitesVides, type Plateforme } from "../contracts/extracted";
import type { CodeErreur } from "../contracts/errors";
import type { AnalysisResult } from "../contracts/result";
import { donneesVides } from "../ai/normaliser";
import type { AvertissementsIa, EvaluerIa, ImageEntree, RaisonEchecIa, UsageIa } from "../ai/types";
import { analyserLien, analyserLiens } from "../links/analyse";
import { contexteScoreDepuis } from "../prix/produit";
import type { ContexteScore } from "../prix/recalcul";
import { plateformeDeLien, type PlateformeAnnonce } from "../links/plateforme";
import type { LienAnalyse } from "../links/types";
import { collecterLiensBruts } from "../rules/contexte";
import { evaluerRegles } from "../rules/moteur";
import { retirerLignesAcheteur } from "../rules/texte-brut";
import { assemblerResultat } from "./assembler";

export interface DemandeAnalyse {
  /** Captures déjà validées et compressées. */
  images: readonly ImageEntree[];
  /** Texte collé (conversation, annonce). */
  texte?: string | null;
  /** Lien collé : une annonce, ou un lien reçu d'un vendeur. */
  lien?: string | null;
  /** Site indiqué par l'utilisateur ; `null` ou « autre » : poids stricts, comme Vinted. */
  site?: Plateforme | null;
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
      /** Le champ lien contenait l'annonce d'un site connu : son contenu n'a pas été lu. */
      lienAnnonce: PlateformeAnnonce | null;
      /** De quoi ajouter plus tard un signal de prix au score sans refaire l'analyse. */
      contexteScore: ContexteScore;
    }
  | {
      ok: false;
      code: CodeErreur;
      ia?: SuiviIa;
      /** Pour `lien_non_recuperable` : le site de l'annonce, s'il est reconnu. */
      lienAnnonce?: PlateformeAnnonce | null;
    };

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
 * - Les liens du texte collé passent toujours par l'analyseur, même quand l'IA a lu la
 *   conversation : un lien suspect ne doit pas dépendre de ce que l'IA a pensé à rapporter.
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
  // Les règles lisent aussi le texte brut, comme filet si l'IA oublie un message du vendeur. On en
  // retire ce que dit l'acheteur (lignes « Moi : » et messages que l'IA lui a attribués) : la
  // séparation des auteurs reste respectée, et les signaux trouvés deux fois ne comptent qu'une.
  const messagesAcheteur = evaluation
    ? evaluation.donnees_extraites.messages
        .filter((m) => m.auteur === "acheteur")
        .map((m) => m.texte)
    : [];
  const texteBrut = texte === null ? null : retirerLignesAcheteur(texte, messagesAcheteur);

  const bruts = collecterLiensBruts(donnees, texte);
  if (lien !== null) bruts.push(lien);
  const liens = analyserLiens(bruts);
  const lienAnnonce = lien !== null ? plateformeDeLien(analyserLien(lien)) : null;

  if (!aDuContenu) {
    const suspect = liens.some((l) => l.verdict === "suspect");
    if (!suspect) return { ok: false, code: "lien_non_recuperable", ia: suivi, lienAnnonce };
  }

  const regles = evaluerRegles({ donnees, texte: texteBrut, liens, site: demande.site ?? null });
  const resultat = assemblerResultat({ donnees, regles, ia: evaluation });
  return {
    ok: true,
    resultat,
    ia: suivi,
    liens,
    ignorees: regles.ignorees,
    lienAnnonce,
    contexteScore: contexteScoreDepuis(
      regles,
      evaluation ? evaluation.score : null,
      resultat.score,
    ),
  };
}
