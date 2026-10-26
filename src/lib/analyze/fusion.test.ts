import { describe, expect, it } from "vitest";
import { SEUIL_ELEVE } from "../contracts/niveau";
import { MARGE_PRUDENCE, fusionnerScores, type EntreeFusion } from "./fusion";

const fusion = (e: Partial<EntreeFusion>) =>
  fusionnerScores({ scoreRegles: 0, scoreIa: null, plancher: null, remise: 0, ...e });

describe("fusionnerScores : base", () => {
  it("sans IA, la base est le score des règles", () => {
    expect(fusion({ scoreRegles: 40 })).toMatchObject({ score: 40, base: 40 });
  });

  it("fait la moyenne quand règles et IA sont proches", () => {
    expect(fusion({ scoreRegles: 40, scoreIa: 60 }).score).toBe(50);
    expect(fusion({ scoreRegles: 30, scoreIa: 40 }).score).toBe(35);
  });

  it("ne descend jamais de plus de la marge de prudence sous la source la plus sévère", () => {
    expect(MARGE_PRUDENCE).toBe(10);
    expect(fusion({ scoreRegles: 20, scoreIa: 60 }).score).toBe(50); // moyenne 40 → 60 − 10
    expect(fusion({ scoreRegles: 70, scoreIa: 10 }).score).toBe(60); // moyenne 40 → 70 − 10
    expect(fusion({ scoreRegles: 10, scoreIa: 90 }).score).toBe(80);
    expect(fusion({ scoreRegles: 59, scoreIa: 15 }).score).toBe(49);
  });

  it("une source qui devient plus sévère ne fait jamais baisser le résultat (règles 59)", () => {
    const parIa = [0, 15, 30, 40, 59, 80].map(
      (ia) => fusion({ scoreRegles: 59, scoreIa: ia }).score,
    );
    expect(parIa).toEqual([...parIa].sort((a, b) => a - b));
  });

  it("borne tout dans 0–100", () => {
    expect(fusion({ scoreRegles: 150 }).score).toBe(100);
    expect(fusion({ scoreRegles: -20, scoreIa: -5 }).score).toBe(0);
  });
});

describe("fusionnerScores : plancher", () => {
  it("l'IA ne fait pas descendre le score sous le plancher", () => {
    expect(fusion({ scoreRegles: 85, plancher: 85, scoreIa: 5 }).score).toBe(85);
    expect(fusion({ scoreRegles: 85, plancher: 85, scoreIa: 40 }).score).toBe(85); // moyenne = 63
    expect(fusion({ scoreRegles: 75, plancher: 75, scoreIa: 10 }).score).toBe(75);
  });

  it("une IA plus sévère l'emporte sur le plancher", () => {
    expect(fusion({ scoreRegles: 75, plancher: 75, scoreIa: 95 }).score).toBe(85);
  });
});

describe("fusionnerScores : remise des rassurants", () => {
  it("retire quelques points", () => {
    const r = fusion({ scoreRegles: 50, scoreIa: 50, remise: 8 });
    expect(r.score).toBe(42);
    expect(r.remiseAppliquee).toBe(8);
  });

  it("ne descend pas sous 0", () => {
    expect(fusion({ scoreRegles: 3, remise: 10 }).score).toBe(0);
  });

  it("ne fait jamais passer un score de « élevé » à « moyen »", () => {
    expect(fusion({ scoreRegles: 65, remise: 10 }).score).toBe(SEUIL_ELEVE);
    expect(fusion({ scoreRegles: 62, remise: 10 }).score).toBe(SEUIL_ELEVE);
    expect(fusion({ scoreRegles: 60, remise: 10 }).score).toBe(SEUIL_ELEVE);
    expect(fusion({ scoreRegles: 59, remise: 10 }).score).toBe(49);
    expect(fusion({ scoreRegles: 65, remise: 10 }).remiseAppliquee).toBe(5);
  });

  it("ne passe jamais sous le plancher", () => {
    expect(fusion({ scoreRegles: 80, plancher: 75, scoreIa: 80, remise: 10 }).score).toBe(75);
    expect(fusion({ scoreRegles: 85, plancher: 85, scoreIa: 0, remise: 10 }).score).toBe(85);
  });

  it("une remise négative est ignorée", () => {
    expect(fusion({ scoreRegles: 40, remise: -10 }).score).toBe(40);
  });
});

describe("fusionnerScores : propriétés sur une grille", () => {
  const regles = [0, 5, 20, 40, 59, 60, 65, 85, 100];
  const ias: Array<number | null> = [null, 0, 15, 40, 59, 60, 80, 100];
  const planchers: Array<number | null> = [null, 70, 85];
  const remises = [0, 4, 10];

  const cas = regles.flatMap((scoreRegles) =>
    ias.flatMap((scoreIa) =>
      planchers.flatMap((plancher) =>
        remises.map((remise) => ({ scoreRegles, scoreIa, plancher, remise })),
      ),
    ),
  );

  it("le score reste dans 0–100 et au moins égal au plancher", () => {
    for (const c of cas) {
      const { score } = fusionnerScores(c);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
      if (c.plancher !== null) expect(score, JSON.stringify(c)).toBeGreaterThanOrEqual(c.plancher);
    }
  });

  it("les rassurants ne font jamais passer de « élevé » à un niveau inférieur", () => {
    for (const c of cas) {
      const { base, score } = fusionnerScores(c);
      if (base >= SEUIL_ELEVE) expect(score, JSON.stringify(c)).toBeGreaterThanOrEqual(SEUIL_ELEVE);
    }
  });

  it("un score IA plus élevé ne fait jamais baisser le résultat", () => {
    for (const scoreRegles of regles) {
      for (const plancher of planchers) {
        for (const remise of remises) {
          let precedent = -1;
          for (const scoreIa of [0, 15, 40, 59, 60, 80, 100]) {
            const { score } = fusionnerScores({ scoreRegles, scoreIa, plancher, remise });
            expect(score, `${scoreRegles}/${scoreIa}`).toBeGreaterThanOrEqual(precedent);
            precedent = score;
          }
        }
      }
    }
  });

  it("une remise plus grande ne fait jamais monter le résultat", () => {
    for (const c of cas) {
      const moins = fusionnerScores({ ...c, remise: 0 }).score;
      const plus = fusionnerScores({ ...c, remise: 10 }).score;
      expect(plus, JSON.stringify(c)).toBeLessThanOrEqual(moins);
    }
  });
});
