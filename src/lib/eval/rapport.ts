import { estimerCout } from "../ai/tarifs";
import type { UsageIa } from "../ai/types";
import {
  calculerFauxPositifs,
  calculerDetection,
  percentile,
  type RapportDetection,
  type RapportFauxPositifs,
} from "./metriques";
import { calculerExtraction, type RapportExtraction } from "./extraction";
import type { SortieCas, StatTaux } from "./types";

export interface SeuilsEval {
  /** Part maximale de conversations saines qui déclenchent une alerte (niveau moyen ou élevé). */
  maxFauxPositifs: number;
  /** Part maximale de conversations saines qui déclenchent une alerte forte (élevé ou critique). */
  maxFauxPositifsSeveres: number;
  /** Part maximale de champs « à laisser nuls » pour lesquels l'IA a inventé une valeur. */
  maxInvention: number;
  /** Part minimale de conversations suspectes détectées au niveau attendu. */
  minDetection: number;
}

export const SEUILS_PAR_DEFAUT: SeuilsEval = {
  maxFauxPositifs: 0.1,
  maxFauxPositifsSeveres: 0,
  maxInvention: 0.1,
  minDetection: 0.8,
};

export interface Porte {
  nom: string;
  ok: boolean;
  detail: string;
  /** Les deux premières portes sont les plus importantes pour la confiance des utilisateurs. */
  principale: boolean;
}

export interface RapportIa {
  appels: number;
  echecs: Record<string, number>;
  latenceP50Ms: number | null;
  latenceP95Ms: number | null;
  jetons: UsageIa;
  coutEstimeUsd: number | null;
  avertissements: { messagesEcartes: number; liensEcartes: number; valeursInvalides: number };
}

export interface RapportEval {
  modele: string;
  date: string;
  mode: "ia" | "regles_seules";
  repetitions: number;
  fauxPositifs: RapportFauxPositifs;
  detection: RapportDetection;
  extraction: RapportExtraction;
  ia: RapportIa;
  portes: Porte[];
}

function agregerIa(sorties: readonly SortieCas[], modele: string): RapportIa {
  const jetons: UsageIa = { entree: 0, sortie: 0, cacheLecture: 0, cacheEcriture: 0 };
  const durees: number[] = [];
  const echecs: Record<string, number> = {};
  const avert = { messagesEcartes: 0, liensEcartes: 0, valeursInvalides: 0 };
  let appels = 0;

  for (const s of sorties) {
    const ia = s.ia;
    if (!ia || ia.statut === "absente") continue;
    appels++;
    durees.push(ia.dureeMs);
    const usage = ia.usage;
    if (usage) {
      jetons.entree += usage.entree;
      jetons.sortie += usage.sortie;
      jetons.cacheLecture += usage.cacheLecture;
      jetons.cacheEcriture += usage.cacheEcriture;
    }
    if (ia.statut === "echec") echecs[ia.raison] = (echecs[ia.raison] ?? 0) + 1;
    if (ia.statut === "ok") {
      avert.messagesEcartes += ia.avertissements.messagesEcartes;
      avert.liensEcartes += ia.avertissements.liensEcartes;
      avert.valeursInvalides += ia.avertissements.valeursInvalides.length;
    }
  }
  return {
    appels,
    echecs,
    latenceP50Ms: percentile(durees, 50),
    latenceP95Ms: percentile(durees, 95),
    jetons,
    coutEstimeUsd: appels === 0 ? 0 : estimerCout(modele, jetons),
    avertissements: avert,
  };
}

export function evaluerPortes(
  fp: RapportFauxPositifs,
  detection: RapportDetection,
  extraction: RapportExtraction,
  seuils: SeuilsEval,
): Porte[] {
  const pct = (x: number) => formaterPourcentage(x);
  return [
    {
      nom: "Faux positifs (alerte à tort sur conversation saine)",
      ok: fp.analyses > 0 && fp.alerte.taux <= seuils.maxFauxPositifs,
      detail: `${pct(fp.alerte.taux)} observé, objectif ≤ ${pct(seuils.maxFauxPositifs)}`,
      principale: true,
    },
    {
      nom: "Faux positifs sévères (élevé ou critique à tort)",
      ok: fp.analyses > 0 && fp.severe.taux <= seuils.maxFauxPositifsSeveres,
      detail: `${pct(fp.severe.taux)} observé, objectif ≤ ${pct(seuils.maxFauxPositifsSeveres)}`,
      principale: true,
    },
    {
      nom: "Détection des conversations suspectes",
      ok: detection.analyses === 0 || detection.detectes.taux >= seuils.minDetection,
      detail: `${pct(detection.detectes.taux)} observé, objectif ≥ ${pct(seuils.minDetection)}`,
      principale: false,
    },
    {
      nom: "Invention de données (champs à laisser nuls)",
      ok: extraction.invention.n === 0 || extraction.invention.taux <= seuils.maxInvention,
      detail:
        extraction.invention.n === 0
          ? "non mesuré (aucun cas d'extraction)"
          : `${pct(extraction.invention.taux)} observé, objectif ≤ ${pct(seuils.maxInvention)}`,
      principale: false,
    },
  ];
}

export function agreger(
  sorties: readonly SortieCas[],
  meta: { modele: string; date: string; mode: RapportEval["mode"]; repetitions: number },
  seuils: SeuilsEval = SEUILS_PAR_DEFAUT,
): RapportEval {
  const fauxPositifs = calculerFauxPositifs(sorties);
  const detection = calculerDetection(sorties);
  const extraction = calculerExtraction(sorties);
  return {
    ...meta,
    fauxPositifs,
    detection,
    extraction,
    ia: agregerIa(sorties, meta.modele),
    portes: evaluerPortes(fauxPositifs, detection, extraction, seuils),
  };
}

export function formaterPourcentage(x: number): string {
  return `${(x * 100).toFixed(1).replace(".", ",")} %`;
}

function ligneTaux(libelle: string, s: StatTaux): string {
  return `${libelle} : ${s.k}/${s.n} = ${formaterPourcentage(s.taux)}  [IC 95 % : ${formaterPourcentage(s.bas)} – ${formaterPourcentage(s.haut)}]`;
}

/** Rapport lisible. Les faux positifs sur conversations saines passent en premier. */
export function formaterRapport(r: RapportEval): string {
  const l: string[] = [];
  const fp = r.fauxPositifs;
  l.push(
    `ÉVALUATION GARDO · ${r.mode === "ia" ? `modèle ${r.modele}` : "règles seules (sans IA)"} · ${r.date}` +
      (r.repetitions > 1 ? ` · ${r.repetitions} répétitions par cas` : ""),
    "",
    "━━ 1. FAUX POSITIFS SUR CONVERSATIONS SAINES (métrique principale) ━━",
    `Analysées : ${fp.analyses}   erreurs : ${fp.erreurs}   ignorées : ${fp.ignores}`,
    ligneTaux("Alerte à tort (moyen ou élevé)       ", fp.alerte),
    ligneTaux("Alerte forte à tort (élevé ou critique)", fp.severe),
    ligneTaux("  dont signal critique d'une règle   ", fp.critique),
  );
  const groupes = Object.entries(fp.parGroupe);
  if (groupes.length > 0) {
    l.push("Par groupe :");
    for (const [groupe, v] of groupes) {
      l.push(
        `  ${groupe.padEnd(10)} alerte ${v.alerte.k}/${v.alerte.n} (${formaterPourcentage(v.alerte.taux)})   forte ${v.severe.k}/${v.severe.n}`,
      );
    }
  }
  l.push(
    `Origine des alertes à tort : règles ${fp.parOrigine.regles} · IA ${fp.parOrigine.ia} · les deux ${fp.parOrigine.les_deux} · combinaison ${fp.parOrigine.fusion}`,
  );
  if (fp.cas.length > 0) {
    l.push("Cas en cause :");
    for (const c of fp.cas) {
      l.push(
        `  ✗ ${c.id} (${c.groupe}) → ${c.niveau}, score ${c.score} (règles ${c.scoreRegles}, IA ${c.scoreIa ?? "–"}, origine : ${c.origine})`,
        `      ${c.description}`,
      );
      for (const s of c.signaux.slice(0, 4))
        l.push(`      [${s.gravite} · ${s.source}] ${s.label}`);
    }
  }
  if (fp.analyses > 0) {
    l.push(
      "",
      `⚠ Portée statistique : avec ${fp.analyses} conversations, ${fp.alerte.k} faux positif${fp.alerte.k > 1 ? "s" : ""} observé${fp.alerte.k > 1 ? "s" : ""} ` +
        `ne permet d'affirmer qu'un taux réel inférieur à ${formaterPourcentage(fp.alerte.haut)}. ` +
        "Pour une garantie plus fine, ajouter de vraies conversations saines anonymisées (100 ou plus).",
    );
  }

  const d = r.detection;
  l.push(
    "",
    "━━ 2. DÉTECTION DES CONVERSATIONS SUSPECTES ━━",
    `Analysées : ${d.analyses}   erreurs : ${d.erreurs}   ignorées : ${d.ignores}`,
    ligneTaux("Niveau attendu atteint", d.detectes),
    ligneTaux("Niveau « élevé » quand attendu", d.eleves),
  );
  for (const m of d.manques) {
    l.push(
      `  ✗ ${m.id} (${m.groupe}) : attendu ${m.attendu}, obtenu ${m.obtenu} (score ${m.score})`,
    );
  }

  const e = r.extraction;
  l.push("", "━━ 3. EXTRACTION (cas avec attentes d'extraction) ━━");
  if (e.cas === 0) {
    l.push("Aucun cas d'extraction analysé.");
  } else {
    l.push(
      `Cas : ${e.cas}`,
      ligneTaux("Champs lus correctement          ", e.exactitude),
      ligneTaux("Invention (valeur là où null attendu)", e.invention),
      `Valeurs fausses annoncées avec confiance « haute » : ${e.fauxConfiantes.k}/${e.fauxConfiantes.sur}`,
      `Inventions déjà écartées par les règles (confiance basse) : ${e.inventionsIgnoreesParLesRegles.k}/${e.inventionsIgnoreesParLesRegles.sur}`,
      "Calibration (exactitude selon la confiance annoncée) :",
      `  haute   ${e.calibration.haute.k}/${e.calibration.haute.n}`,
      `  moyenne ${e.calibration.moyenne.k}/${e.calibration.moyenne.n}`,
      `  basse   ${e.calibration.basse.k}/${e.calibration.basse.n}`,
      ligneTaux("Auteur des messages correctement attribué", e.auteurs.total),
      `  acheteur pris pour le vendeur : ${e.auteurs.acheteurPrisPourVendeur}  (crée des faux positifs)`,
      `  vendeur pris pour l'acheteur  : ${e.auteurs.vendeurPrisPourAcheteur}  (fait manquer des alertes)`,
      `  auteur deviné alors qu'inconnu : ${e.auteurs.devine}`,
      `Messages inventés (absents du contenu) : ${e.messagesInventes}`,
    );
    const mauvais = e.lignes.filter((x) => x.issue === "faux" || x.issue === "invention");
    for (const x of mauvais.slice(0, 12)) {
      l.push(
        `  ✗ ${x.cas} · ${x.champ} : attendu ${JSON.stringify(x.attendu)}, obtenu ${JSON.stringify(x.obtenu)} (confiance ${x.confiance ?? "–"})`,
      );
    }
  }

  const ia = r.ia;
  l.push("", "━━ 4. IA : COÛT ET DÉLAIS ━━");
  if (ia.appels === 0) {
    l.push("Aucun appel à l'IA.");
  } else {
    const ms = (v: number | null) =>
      v === null ? "–" : `${(v / 1000).toFixed(1).replace(".", ",")} s`;
    l.push(
      `Appels : ${ia.appels}   échecs : ${
        Object.entries(ia.echecs)
          .map(([k, v]) => `${k} ${v}`)
          .join(", ") || "aucun"
      }`,
      `Durée : médiane ${ms(ia.latenceP50Ms)}, p95 ${ms(ia.latenceP95Ms)}`,
      `Jetons : ${ia.jetons.entree} en entrée (dont ${ia.jetons.cacheLecture} lus en cache), ${ia.jetons.sortie} en sortie`,
      `Coût estimé : ${ia.coutEstimeUsd === null ? "tarif inconnu pour ce modèle" : `${ia.coutEstimeUsd.toFixed(4)} $ (≈ ${((ia.coutEstimeUsd / ia.appels) * 100).toFixed(2).replace(".", ",")} ¢ par analyse)`}`,
      `Nettoyage de la réponse : ${ia.avertissements.messagesEcartes} message(s) inventé(s) et ${ia.avertissements.liensEcartes} lien(s) inventé(s) écartés, ${ia.avertissements.valeursInvalides} valeur(s) hors limites remises à null`,
    );
  }

  l.push("", "━━ VERDICT ━━");
  for (const p of r.portes)
    l.push(`${p.ok ? "✓" : "✗"} ${p.nom}${p.principale ? " [principal]" : ""} : ${p.detail}`);
  const principalesOk = r.portes.filter((p) => p.principale).every((p) => p.ok);
  l.push(
    r.portes.every((p) => p.ok)
      ? "→ Tous les objectifs sont atteints."
      : principalesOk
        ? "→ Objectifs principaux atteints, autres objectifs à travailler."
        : "→ Objectif principal non atteint : trop de faux positifs.",
  );
  return l.join("\n");
}
