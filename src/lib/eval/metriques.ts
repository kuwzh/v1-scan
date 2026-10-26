import type { Niveau } from "../contracts/niveau";
import { niveauPourScore } from "../contracts/niveau";
import { rangGravite } from "../contracts/signals";
import type { SortieCas, StatTaux } from "./types";

export const ORDRE_NIVEAUX: Readonly<Record<Niveau, number>> = { faible: 0, moyen: 1, élevé: 2 };

export function niveauAuMoins(niveau: Niveau, seuil: Niveau): boolean {
  return ORDRE_NIVEAUX[niveau] >= ORDRE_NIVEAUX[seuil];
}

/**
 * Intervalle de Wilson à 95 % pour une proportion k/n. Sur un petit échantillon, « 0 faux
 * positif sur 24 » ne veut pas dire « 0 % » : la borne haute (~14 %) dit ce que ce résultat
 * permet réellement d'affirmer.
 */
export function intervalleWilson(k: number, n: number, z = 1.96): { bas: number; haut: number } {
  if (n === 0) return { bas: 0, haut: 1 };
  const p = k / n;
  const z2 = z * z;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const marge = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return { bas: Math.max(0, centre - marge), haut: Math.min(1, centre + marge) };
}

export function stat(k: number, n: number): StatTaux {
  const { bas, haut } = intervalleWilson(k, n);
  return { k, n, taux: n === 0 ? 0 : k / n, bas, haut };
}

export function percentile(valeurs: readonly number[], p: number): number | null {
  if (valeurs.length === 0) return null;
  const tri = [...valeurs].sort((a, b) => a - b);
  const index = Math.min(tri.length - 1, Math.max(0, Math.ceil((p / 100) * tri.length) - 1));
  return tri[index] ?? null;
}

export type OrigineAlerte = "regles" | "ia" | "les_deux" | "fusion";

export interface FauxPositif {
  id: string;
  groupe: string;
  description: string;
  repetition: number;
  niveau: Niveau;
  score: number;
  scoreRegles: number;
  scoreIa: number | null;
  origine: OrigineAlerte;
  signaux: Array<{ id: string; label: string; gravite: string; source: string }>;
  critique: boolean;
}

export interface RapportFauxPositifs {
  /** Conversations saines effectivement analysées (les erreurs et les cas ignorés en sont exclus). */
  analyses: number;
  erreurs: number;
  ignores: number;
  /** Une alerte affichée à tort : niveau « moyen » ou « élevé ». */
  alerte: StatTaux;
  /** Une alerte forte à tort : niveau « élevé » ou signal critique. */
  severe: StatTaux;
  /** Au moins un signal critique levé par une règle, à tort. */
  critique: StatTaux;
  parGroupe: Record<string, { alerte: StatTaux; severe: StatTaux }>;
  /** D'où vient l'alerte à tort : règles seules, IA seule, les deux. */
  parOrigine: Record<OrigineAlerte, number>;
  cas: FauxPositif[];
}

function origineDe(scoreRegles: number, scoreIa: number | null): OrigineAlerte {
  const regles = niveauAuMoins(niveauPourScore(scoreRegles), "moyen");
  const ia = scoreIa !== null && niveauAuMoins(niveauPourScore(scoreIa), "moyen");
  if (regles && ia) return "les_deux";
  if (regles) return "regles";
  if (ia) return "ia";
  return "fusion"; // ni l'une ni l'autre seule n'atteint « moyen » : l'alerte vient de la combinaison
}

/**
 * Taux de faux positifs sur les conversations saines : la métrique qui compte le plus pour la
 * confiance des utilisateurs, mesurée à part. Une erreur d'analyse n'est ni un succès ni un
 * faux positif : elle est comptée à part, jamais dans le dénominateur.
 */
export function calculerFauxPositifs(sorties: readonly SortieCas[]): RapportFauxPositifs {
  const sains = sorties.filter((s) => s.cas.categorie === "sain");
  const analyses = sains.filter((s) => s.statut === "analyse" && s.resultat);
  const fauxPositifs: FauxPositif[] = [];
  const groupes = new Map<string, SortieCas[]>();

  for (const s of analyses) {
    const r = s.resultat!;
    const critique = r.signaux.some((x) => x.gravite === "critique");
    const alerte = niveauAuMoins(r.niveau, "moyen");
    const severe = r.niveau === "élevé" || critique;
    groupes.set(s.cas.groupe, [...(groupes.get(s.cas.groupe) ?? []), s]);
    if (alerte || severe) {
      fauxPositifs.push({
        id: s.cas.id,
        groupe: s.cas.groupe,
        description: s.cas.description,
        repetition: s.repetition,
        niveau: r.niveau,
        score: r.score,
        scoreRegles: r.meta.score_regles,
        scoreIa: r.meta.score_ia,
        origine: origineDe(r.meta.score_regles, r.meta.score_ia),
        signaux: [...r.signaux]
          .sort((a, b) => rangGravite(b.gravite) - rangGravite(a.gravite))
          .map((x) => ({ id: x.id, label: x.label, gravite: x.gravite, source: x.source })),
        critique,
      });
    }
  }

  const compter = (
    liste: readonly SortieCas[],
    f: (r: NonNullable<SortieCas["resultat"]>) => boolean,
  ) => liste.filter((s) => s.resultat && f(s.resultat)).length;
  const estAlerte = (r: NonNullable<SortieCas["resultat"]>) => niveauAuMoins(r.niveau, "moyen");
  const estSevere = (r: NonNullable<SortieCas["resultat"]>) =>
    r.niveau === "élevé" || r.signaux.some((x) => x.gravite === "critique");
  const aCritique = (r: NonNullable<SortieCas["resultat"]>) =>
    r.signaux.some((x) => x.gravite === "critique" && x.source === "regle");

  const parGroupe: RapportFauxPositifs["parGroupe"] = {};
  for (const [groupe, liste] of groupes) {
    parGroupe[groupe] = {
      alerte: stat(compter(liste, estAlerte), liste.length),
      severe: stat(compter(liste, estSevere), liste.length),
    };
  }

  const parOrigine: Record<OrigineAlerte, number> = { regles: 0, ia: 0, les_deux: 0, fusion: 0 };
  for (const fp of fauxPositifs) parOrigine[fp.origine]++;

  return {
    analyses: analyses.length,
    erreurs: sains.filter((s) => s.statut === "erreur").length,
    ignores: sains.filter((s) => s.statut === "ignore").length,
    alerte: stat(compter(analyses, estAlerte), analyses.length),
    severe: stat(compter(analyses, estSevere), analyses.length),
    critique: stat(compter(analyses, aCritique), analyses.length),
    parGroupe,
    parOrigine,
    cas: fauxPositifs,
  };
}

export interface RapportDetection {
  analyses: number;
  erreurs: number;
  ignores: number;
  /** Niveau au moins égal à celui attendu. */
  detectes: StatTaux;
  /** Parmi ceux dont l'attendu est « élevé » : le niveau « élevé » est atteint. */
  eleves: StatTaux;
  parGroupe: Record<string, StatTaux>;
  manques: Array<{ id: string; groupe: string; attendu: Niveau; obtenu: Niveau; score: number }>;
}

/** Détection des conversations suspectes : de quoi s'assurer qu'on ne gagne pas en faux positifs en perdant les vraies alertes. */
export function calculerDetection(sorties: readonly SortieCas[]): RapportDetection {
  const suspects = sorties.filter((s) => s.cas.categorie === "suspect");
  const analyses = suspects.filter((s) => s.statut === "analyse" && s.resultat);
  const manques: RapportDetection["manques"] = [];
  const parGroupe = new Map<string, { k: number; n: number }>();
  let detectes = 0;
  let eleves = 0;
  let elevesAttendus = 0;

  for (const s of analyses) {
    const attendu = s.cas.attendu.niveauMin ?? "moyen";
    const r = s.resultat!;
    const ok = niveauAuMoins(r.niveau, attendu);
    const g = parGroupe.get(s.cas.groupe) ?? { k: 0, n: 0 };
    g.n++;
    if (ok) {
      detectes++;
      g.k++;
    } else {
      manques.push({
        id: s.cas.id,
        groupe: s.cas.groupe,
        attendu,
        obtenu: r.niveau,
        score: r.score,
      });
    }
    parGroupe.set(s.cas.groupe, g);
    if (attendu === "élevé") {
      elevesAttendus++;
      if (r.niveau === "élevé") eleves++;
    }
  }

  return {
    analyses: analyses.length,
    erreurs: suspects.filter((s) => s.statut === "erreur").length,
    ignores: suspects.filter((s) => s.statut === "ignore").length,
    detectes: stat(detectes, analyses.length),
    eleves: stat(eleves, elevesAttendus),
    parGroupe: Object.fromEntries([...parGroupe].map(([g, v]) => [g, stat(v.k, v.n)])),
    manques,
  };
}
