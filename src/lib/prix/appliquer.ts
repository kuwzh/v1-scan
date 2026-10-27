import type { PrixResponse } from "../contracts/prix";
import type { AnalysisResult } from "../contracts/result";
import type { Gravite } from "../contracts/signals";
import { fr } from "../copy/fr";

/**
 * Ce module est importé par le navigateur : types seulement côté contrats (pas de zod dans le
 * bundle). `RANG` répète donc l'ordre de `GRAVITES` ; un test vérifie qu'ils concordent.
 */
export const RANG_GRAVITE: Readonly<Record<Gravite, number>> = {
  info: 0,
  attention: 1,
  importante: 2,
  critique: 3,
};

/** Même limite que l'assemblage du résultat (`MAX_CONSEILS`). */
const MAX_CONSEILS = 5;

/**
 * Applique la comparaison de prix à un résultat d'analyse : nouveau score et niveau calculés par
 * le serveur, signal de la table de prix retiré s'il est remplacé, signal de la comparaison
 * ajouté à sa place dans l'ordre de gravité. Sans effet (même objet) quand la comparaison ne
 * change rien. Le résultat de départ n'est jamais modifié.
 */
export function appliquerPrix(resultat: AnalysisResult, prix: PrixResponse): AnalysisResult {
  const retires = new Set(prix.resultat.signaux_retires);
  const signal = prix.signal;
  const dejaLa = signal !== null && resultat.signaux.some((s) => s.id === signal.id);
  if (
    retires.size === 0 &&
    (signal === null || dejaLa) &&
    prix.resultat.score === resultat.score &&
    prix.resultat.niveau === resultat.niveau
  ) {
    return resultat;
  }

  let signaux = resultat.signaux.filter((s) => !retires.has(s.id));
  let conseils = resultat.conseils;
  if (signal !== null && !dejaLa) {
    signaux = [...signaux, signal].sort(
      (a, b) =>
        RANG_GRAVITE[b.gravite] - RANG_GRAVITE[a.gravite] ||
        (a.source === b.source ? 0 : a.source === "regle" ? -1 : 1),
    );
    if (!conseils.includes(fr.conseilsRegles.prixBas) && conseils.length < MAX_CONSEILS) {
      conseils = [...conseils, fr.conseilsRegles.prixBas];
    }
  }
  return {
    ...resultat,
    score: prix.resultat.score,
    niveau: prix.resultat.niveau,
    signaux,
    conseils,
  };
}
