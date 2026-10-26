import type { AiEvaluation } from "../contracts/ai";
import type { ExtractedData } from "../contracts/extracted";
import { niveauPourScore } from "../contracts/niveau";
import type { AnalysisResult } from "../contracts/result";
import { rangGravite, type Rassurant, type Signal } from "../contracts/signals";
import { fr } from "../copy/fr";
import type { ResultatRegles } from "../rules/types";
import { fusionnerScores } from "./fusion";
import { nettoyerConseilIa, nettoyerLibelleIa, sansDoublons } from "./nettoyage";

const MAX_SIGNAUX_IA = 8;
const MAX_RASSURANTS = 6;
const MAX_CONSEILS = 5;
const MIN_CONSEILS = 2;

export interface EntreeAssemblage {
  /** Données lues, utilisées si l'IA n'a rien renvoyé. */
  donnees: ExtractedData;
  regles: ResultatRegles;
  /** `null` : IA absente ou réponse inutilisable (analyse partielle). */
  ia: AiEvaluation | null;
}

/** Un rassurant qui parle de plateforme ou de paiement contredit un signal sur ces sujets. */
const SUJETS_CONTREDITS = /plateforme|paiement|livraison|messagerie|vinted|leboncoin/i;
const FAMILLES_CONTREDITES = /^(?:paiement|plateforme|script)\./;

/**
 * Assemble le résultat final : fusion des scores, signaux des règles et de l'IA, rassurants,
 * conseils. Tout ce qui vient de l'IA est nettoyé (longueur, formulations accusatoires,
 * doublons avec les règles) ; ses signaux n'ont jamais d'effet sur le plancher.
 */
export function assemblerResultat({ donnees, regles, ia }: EntreeAssemblage): AnalysisResult {
  const fusion = fusionnerScores({
    scoreRegles: regles.score,
    scoreIa: ia ? ia.score : null,
    plancher: regles.plancher,
    remise: regles.remise,
  });
  const score = fusion.score;
  const niveau = niveauPourScore(score);

  // Signaux : règles d'abord, puis ceux de l'IA qui n'en répètent aucun.
  const libellesRegles = regles.signaux.map((s) => s.label);
  const libellesIa = (ia?.signaux ?? []).flatMap((s) => {
    const label = nettoyerLibelleIa(s.label);
    return label ? [{ label, gravite: s.gravite }] : [];
  });
  const gardesIa = new Set(
    sansDoublons(
      libellesIa.map((s) => s.label),
      libellesRegles,
    ),
  );
  const signauxIa: Signal[] = libellesIa
    .filter((s) => gardesIa.has(s.label))
    .slice(0, MAX_SIGNAUX_IA)
    .map((s, i) => ({ id: `ia.${i + 1}`, label: s.label, gravite: s.gravite, source: "ia" }));
  const signaux = [...regles.signaux, ...signauxIa].sort(
    (a, b) =>
      rangGravite(b.gravite) - rangGravite(a.gravite) ||
      (a.source === b.source ? 0 : a.source === "regle" ? -1 : 1),
  );

  // Rassurants : jamais en contradiction avec un signal de paiement ou de sortie de plateforme.
  const contredit = regles.signaux.some((s) => FAMILLES_CONTREDITES.test(s.id));
  const rassurantsIa = (ia?.rassurants ?? []).flatMap((r) => {
    const label = nettoyerLibelleIa(r.label);
    return label && !(contredit && SUJETS_CONTREDITS.test(label)) ? [label] : [];
  });
  const rassurantsRegles = regles.rassurants.filter(
    (r) => !(contredit && SUJETS_CONTREDITS.test(r.label)),
  );
  const rassurants: Rassurant[] = [
    ...rassurantsRegles,
    ...sansDoublons(
      rassurantsIa,
      rassurantsRegles.map((r) => r.label),
    ).map((label, i) => ({
      id: `ia.rassurant.${i + 1}`,
      label,
      source: "ia" as const,
    })),
  ].slice(0, MAX_RASSURANTS);

  // Conseils : ceux des règles (précis), puis ceux de l'IA, puis des conseils par défaut.
  const conseilsIa = (ia?.conseils ?? []).flatMap((c) => {
    const conseil = nettoyerConseilIa(c);
    return conseil ? [conseil] : [];
  });
  const conseils = [...regles.conseils];
  conseils.push(...sansDoublons(conseilsIa, conseils));
  if (conseils.length < MIN_CONSEILS) {
    conseils.push(...sansDoublons(fr.conseilsParDefaut[niveau], conseils));
  }

  return {
    score,
    niveau,
    signaux,
    rassurants,
    conseils: conseils.slice(0, MAX_CONSEILS),
    donnees_extraites: ia ? ia.donnees_extraites : donnees,
    meta: {
      mode: ia ? "complet" : "regles_seules",
      score_regles: regles.score,
      score_ia: ia ? ia.score : null,
      plancher: regles.plancher,
    },
  };
}
