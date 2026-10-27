import { describe, expect, it } from "vitest";
import { trouverFormulationsInterdites } from "../copy/wording";
import { fr } from "../copy/fr";
import { BANDES_POIDS } from "../rules/poids";
import {
  POIDS_PRIX_WEB,
  SEUIL_BAS_PCT,
  SEUIL_TRES_BAS_PCT,
  comparerPrix,
  gravitePourPrix,
  signalPourPrix,
} from "./comparer";
import { estimationValide } from "./test-utils";

describe("gravitePourPrix : les seuils de 40 % et de 60 % du bas de la fourchette d'occasion", () => {
  // Fourchette basse : 1 000 €.
  it.each([
    [0, "importante"],
    [100, "importante"],
    [399, "importante"],
    [399.99, "importante"],
    [400, "attention"], // 40 % pile : « entre 40 et 60 % »
    [500, "attention"],
    [600, "attention"], // 60 % pile : encore « entre 40 et 60 % »
    [600.01, null],
    [800, null],
    [1_000, null],
    [5_000, null],
  ])("prix %s € → %s", (prix, attendu) => {
    expect(gravitePourPrix(prix, 1_000)).toBe(attendu);
  });

  it("les seuils sont ceux demandés", () => {
    expect([SEUIL_TRES_BAS_PCT, SEUIL_BAS_PCT]).toEqual([40, 60]);
  });

  it("est exacte sur des fourchettes décimales (pas d'erreur d'arrondi flottant)", () => {
    expect(gravitePourPrix(39.89, 99.75)).toBe("importante"); // 40 % de 99,75 = 39,9
    expect(gravitePourPrix(39.9, 99.75)).toBe("attention"); // 40 % pile
    expect(gravitePourPrix(0.4 * 70, 70)).toBe("attention"); // 28,000000000000004 en flottant
    expect(gravitePourPrix(0.6 * 70, 70)).toBe("attention"); // 42 (ou 41,99999…) : encore 60 %
  });

  it("jamais « critique », quel que soit le prix", () => {
    for (let prix = 0; prix <= 3_000; prix += 7) {
      for (const min of [1, 15, 99.5, 700, 2_500]) {
        expect(["importante", "attention", null]).toContain(gravitePourPrix(prix, min));
      }
    }
  });

  it("refuse les entrées absurdes sans signal", () => {
    expect(gravitePourPrix(10, 0)).toBeNull();
    expect(gravitePourPrix(10, -5)).toBeNull();
    expect(gravitePourPrix(-1, 100)).toBeNull();
    expect(gravitePourPrix(Number.NaN, 100)).toBeNull();
  });
});

describe("comparerPrix : les chiffres affichés", () => {
  it("écart au prix d'occasion habituel (milieu de la fourchette) et part du bas de la fourchette", () => {
    // Fourchette 700–1 100 : habituel 900.
    const c = comparerPrix(450, estimationValide());
    expect(c).toEqual({
      prix_annonce_eur: 450,
      occasion_habituelle_eur: 900,
      ecart_pct: -50,
      part_du_bas_pct: 64,
      fiable: true,
    });
  });

  it("un prix dans la fourchette ou au-dessus a un écart nul ou positif", () => {
    expect(comparerPrix(900, estimationValide())?.ecart_pct).toBe(0);
    expect(comparerPrix(1_350, estimationValide())?.ecart_pct).toBe(50);
  });

  it("pas de fourchette d'occasion : rien à comparer", () => {
    expect(
      comparerPrix(100, estimationValide({ occasion_min_eur: null, occasion_max_eur: null })),
    ).toBeNull();
  });

  it("une estimation à confiance basse, ou sans source, n'est pas fiable", () => {
    expect(comparerPrix(100, estimationValide({ confiance: "basse" }))?.fiable).toBe(false);
    expect(comparerPrix(100, estimationValide({ sources: [] }))?.fiable).toBe(false);
    expect(comparerPrix(100, estimationValide({ confiance: "moyenne" }))?.fiable).toBe(true);
  });
});

describe("signalPourPrix", () => {
  const signal = (prix: number, partiel = {}) => {
    const e = estimationValide(partiel);
    return signalPourPrix(prix, e, comparerPrix(prix, e));
  };

  it("moins de 40 % du bas de la fourchette : « importante »", () => {
    const s = signal(250); // 250 < 0,4 × 700 = 280
    expect(s?.signal).toMatchObject({ id: "prix.web", gravite: "importante", source: "regle" });
    expect(s?.signal.label).toBe(fr.regles.prixWeb.tresBas);
    expect(s?.poids).toBe(POIDS_PRIX_WEB.importante);
  });

  it("de 40 à 60 % : « attention »", () => {
    const s = signal(350); // 50 %
    expect(s?.signal.gravite).toBe("attention");
    expect(s?.signal.label).toBe(fr.regles.prixWeb.bas);
    expect(s?.poids).toBe(POIDS_PRIX_WEB.attention);
  });

  it("un prix normal ne produit aucun signal", () => {
    expect(signal(800)).toBeNull();
    expect(signal(1_500)).toBeNull();
  });

  it("une estimation peu sûre ne produit aucun signal, même pour un prix très bas", () => {
    expect(signal(50, { confiance: "basse" })).toBeNull();
    expect(signal(50, { sources: [] })).toBeNull();
  });

  it("une confiance moyenne suffit", () => {
    expect(signal(50, { confiance: "moyenne" })?.signal.gravite).toBe("importante");
  });

  it("les poids restent dans la bande de leur gravité (importante 0,30–0,55 ; attention 0,12–0,30)", () => {
    for (const [gravite, poids] of Object.entries(POIDS_PRIX_WEB)) {
      const [min, max] = BANDES_POIDS[gravite as keyof typeof BANDES_POIDS];
      expect(poids).toBeGreaterThanOrEqual(min);
      expect(poids).toBeLessThanOrEqual(max);
    }
  });

  it("les libellés respectent le wording prudent et ne parlent pas de la personne", () => {
    for (const texte of [fr.regles.prixWeb.tresBas, fr.regles.prixWeb.bas]) {
      expect(trouverFormulationsInterdites(texte)).toEqual([]);
      expect(texte).not.toMatch(/arnaque|faux|contrefa/i);
      expect(texte).toMatch(/estimée/);
    }
  });
});
