import { describe, expect, it } from "vitest";
import { evaluerRegles } from "../rules/moteur";
import { fusionnerScores } from "../analyze/fusion";
import { donneesExtraitesVides } from "../contracts/extracted";
import { analyserLiens } from "../links/analyse";
import type { SignalPrix } from "./comparer";
import { recalculerAvecPrix, type ContexteScore } from "./recalcul";

const prix = (gravite: "importante" | "attention", poids: number): SignalPrix => ({
  signal: { id: "prix.web", label: "Prix", gravite, source: "regle" },
  poids,
  conseil: "c",
});

const base = (partiel: Partial<ContexteScore> = {}): ContexteScore => ({
  poids: [],
  plancher: null,
  remise: 0,
  scoreIa: null,
  prixTable: null,
  score: 0,
  ...partiel,
});

describe("recalculerAvecPrix", () => {
  it("sans signal de prix, le score ne change pas", () => {
    const r = recalculerAvecPrix(base({ score: 23, poids: [0.2] }), null);
    expect(r).toEqual({ score: 23, niveau: "faible", signauxRetires: [], signalApplique: false });
  });

  it("un signal « importante » s'ajoute au cumul des règles (poids 0,4 + 0,38)", () => {
    const r = recalculerAvecPrix(base({ poids: [0.4], score: 40 }), prix("importante", 0.38));
    // 100 × (1 − 0,6 × 0,62) = 62,8 → 63
    expect(r.score).toBe(63);
    expect(r.niveau).toBe("élevé");
    expect(r.signalApplique).toBe(true);
  });

  it("une analyse sans aucun signal passe de faible à moyen avec un prix très bas", () => {
    const r = recalculerAvecPrix(base({ score: 0 }), prix("importante", 0.38));
    expect(r.score).toBe(38);
    expect(r.niveau).toBe("moyen");
  });

  it("un signal « attention » seul reste en dessous de « moyen »", () => {
    const r = recalculerAvecPrix(base(), prix("attention", 0.22));
    expect(r.score).toBe(22);
    expect(r.niveau).toBe("faible");
  });

  it("tient compte de l'IA : moyenne des deux, sans descendre de plus de 10 points sous la plus sévère", () => {
    const r = recalculerAvecPrix(base({ scoreIa: 0 }), prix("importante", 0.38));
    expect(r.score).toBe(
      fusionnerScores({ scoreRegles: 38, scoreIa: 0, plancher: null, remise: 0 }).score,
    );
    expect(r.score).toBeGreaterThanOrEqual(28);
  });

  it("jamais sous le plancher d'un signal critique", () => {
    const r = recalculerAvecPrix(
      base({ plancher: 75, scoreIa: 5, score: 75 }),
      prix("attention", 0.22),
    );
    expect(r.score).toBeGreaterThanOrEqual(75);
  });

  it("la remise des rassurants s'applique comme avant", () => {
    const sans = recalculerAvecPrix(base({ poids: [0.1] }), prix("importante", 0.38));
    const avec = recalculerAvecPrix(base({ poids: [0.1], remise: 10 }), prix("importante", 0.38));
    expect(avec.score).toBeLessThan(sans.score);
  });

  describe("le signal de la table de prix (marque seule)", () => {
    const table = { id: "prix.tres_bas", gravite: "importante" as const, poids: 0.38 };

    it("est remplacé par la comparaison quand elle est au moins aussi grave", () => {
      const r = recalculerAvecPrix(
        base({ prixTable: table, poids: [0.4], score: 63 }),
        prix("importante", 0.38),
      );
      expect(r.signauxRetires).toEqual(["prix.tres_bas"]);
      expect(r.score).toBe(63); // même poids : le prix n'est pas compté deux fois
      expect(r.signalApplique).toBe(true);
    });

    it("est gardé quand il est plus grave : on ne baisse pas le risque sur la foi d'une estimation", () => {
      const r = recalculerAvecPrix(
        base({ prixTable: table, poids: [0.4], score: 63 }),
        prix("attention", 0.22),
      );
      expect(r).toEqual({ score: 63, niveau: "élevé", signauxRetires: [], signalApplique: false });
    });

    it("un signal « attention » de la table est remplacé par un « importante »", () => {
      const r = recalculerAvecPrix(
        base({ prixTable: { id: "prix.bas", gravite: "attention", poids: 0.22 }, score: 22 }),
        prix("importante", 0.38),
      );
      expect(r.signauxRetires).toEqual(["prix.bas"]);
      expect(r.score).toBe(38);
    });
  });

  it("équivaut à une analyse complète : mêmes poids, même score que le moteur de règles", () => {
    const donnees = donneesExtraitesVides();
    const texte = "Vendeur : écris-moi sur WhatsApp, paiement par mandat cash.";
    const regles = evaluerRegles({ donnees, texte, liens: analyserLiens([]) });
    const ctx = base({
      poids: regles.constats.map((c) => c.poids),
      plancher: regles.plancher,
      remise: regles.remise,
      score: regles.score,
    });
    const avecPrix = recalculerAvecPrix(ctx, prix("importante", 0.38));
    // Référence : le moteur avec un constat de prix ajouté à la main.
    const reference = fusionnerScores({
      scoreRegles: Math.max(
        Math.round(
          100 *
            (1 - [...regles.constats.map((c) => c.poids), 0.38].reduce((p, w) => p * (1 - w), 1)),
        ),
        regles.plancher ?? 0,
      ),
      scoreIa: null,
      plancher: regles.plancher,
      remise: regles.remise,
    });
    expect(avecPrix.score).toBe(reference.score);
  });
});
