import { niveauPourScore, type Niveau } from "../contracts/niveau";
import { rangGravite, type Gravite } from "../contracts/signals";
import { fusionnerScores } from "../analyze/fusion";
import { cumulerPoids } from "../rules/moteur";
import type { SignalPrix } from "./comparer";

/**
 * Ce qu'il faut garder d'une analyse pour y ajouter plus tard un signal de prix sans la refaire :
 * des nombres seulement, aucun contenu. Le score des règles est un cumul de poids
 * (`cumulerPoids`) : on garde les poids des signaux autres que celui de la table de prix.
 */
export interface ContexteScore {
  /** Poids des signaux des règles, hors signal « prix » de la table. */
  poids: number[];
  plancher: number | null;
  remise: number;
  scoreIa: number | null;
  /** Signal « prix » de la table (marque seule), s'il y en avait un : la comparaison le remplace. */
  prixTable: { id: string; gravite: Gravite; poids: number } | null;
  /** Score affiché à l'issue de l'analyse. */
  score: number;
}

export interface ScoreRecalcule {
  score: number;
  niveau: Niveau;
  /** Signaux de la liste à retirer (le signal de la table, remplacé par celui de la comparaison). */
  signauxRetires: string[];
  /** Le signal de prix est ajouté à la liste. */
  signalApplique: boolean;
}

/**
 * Score après comparaison. Le signal de prix remplace celui de la table quand il est au moins
 * aussi grave ; sinon on garde celui de la table (on ne baisse jamais le risque d'une analyse
 * sur la foi d'une estimation) et le signal de prix n'est pas ajouté, pour ne pas compter le prix
 * deux fois. Sans signal de prix, le score ne change pas.
 */
export function recalculerAvecPrix(ctx: ContexteScore, prix: SignalPrix | null): ScoreRecalcule {
  const inchange: ScoreRecalcule = {
    score: ctx.score,
    niveau: niveauPourScore(ctx.score),
    signauxRetires: [],
    signalApplique: false,
  };
  if (prix === null) return inchange;
  if (ctx.prixTable && rangGravite(ctx.prixTable.gravite) > rangGravite(prix.signal.gravite)) {
    return inchange;
  }

  const scoreBrut = cumulerPoids([...ctx.poids, prix.poids]);
  const fusion = fusionnerScores({
    scoreRegles: Math.max(scoreBrut, ctx.plancher ?? 0),
    scoreIa: ctx.scoreIa,
    plancher: ctx.plancher,
    remise: ctx.remise,
  });
  return {
    score: fusion.score,
    niveau: niveauPourScore(fusion.score),
    signauxRetires: ctx.prixTable ? [ctx.prixTable.id] : [],
    signalApplique: true,
  };
}
