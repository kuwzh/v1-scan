import { describe, expect, it } from "vitest";
import { donneesExtraitesVides } from "../contracts/extracted";
import type { Plateforme } from "../contracts/extracted";
import { fusionnerScores } from "../analyze/fusion";
import { evaluerRegles } from "./moteur";

const regles = (texte: string, site?: Plateforme | null, plateformeIa?: Plateforme) => {
  const donnees = donneesExtraitesVides();
  if (plateformeIa) donnees.plateforme = plateformeIa;
  return evaluerRegles({ donnees, texte, liens: [], site });
};

describe("PayPal : une sortie de plateforme sur Vinted", () => {
  it("« paiement paypal » seul donne au moins « moyen » (30), pas 20", () => {
    const r = regles("paiement paypal", "vinted");
    expect(r.score).toBeGreaterThanOrEqual(30);
    expect(r.signaux.map((s) => s.id)).toContain("paiement.paypal");
    expect(r.signaux.find((s) => s.id === "paiement.paypal")?.gravite).toBe("importante");
  });

  it.each([undefined, null, "vinted", "autre"] as const)(
    "site %s : poids stricts (ceux de Vinted)",
    (site) => {
      expect(regles("on peut faire un paiement paypal", site).score).toBeGreaterThanOrEqual(30);
    },
  );

  it.each(["leboncoin", "facebook_marketplace"] as const)(
    "site %s : le poids reste réduit (on y paie souvent en direct)",
    (site) => {
      const r = regles("paiement paypal", site);
      expect(r.score).toBeLessThan(30);
      expect(r.signaux.find((s) => s.id === "paiement.paypal")?.gravite).toBe("info");
    },
  );

  it("ce que l'IA lit sur la capture prime sur le site présélectionné", () => {
    expect(regles("paiement paypal", "vinted", "leboncoin").score).toBeLessThan(30);
    expect(regles("paiement paypal", "leboncoin", "vinted").score).toBeGreaterThanOrEqual(30);
  });

  it("une plateforme « autre » lue par l'IA ne masque pas le site choisi", () => {
    expect(regles("paiement paypal", "leboncoin", "autre").score).toBeLessThan(30);
    expect(regles("paiement paypal", "vinted", "autre").score).toBeGreaterThanOrEqual(30);
  });

  it.each([
    "Je n'accepte pas PayPal, uniquement Vinted.",
    "Pas de paypal ici, tout passe par Vinted",
    "Paiement uniquement via Vinted, jamais par PayPal",
  ])("une phrase qui refuse PayPal ne déclenche rien : %s", (texte) => {
    expect(regles(texte, "vinted").signaux.map((s) => s.id)).not.toContain("paiement.paypal");
  });

  it("PayPal « entre proches » reste plus grave encore", () => {
    const r = regles("paiement paypal entre proches stp", "vinted");
    expect(r.signaux.map((s) => s.id)).toContain("paiement.paypal_proches");
    expect(r.score).toBeGreaterThan(regles("paiement paypal", "vinted").score);
  });
});

describe("PayPal : le résultat final reste au moins « moyen »", () => {
  const final = (scoreIa: number | null, remise = 0) => {
    const r = regles("paiement paypal", "vinted");
    return fusionnerScores({
      scoreRegles: r.score,
      scoreIa,
      plancher: r.plancher,
      remise: remise || r.remise,
    }).score;
  };

  it.each([null, 0, 5, 20, 60])("quelle que soit l'IA (score %s)", (scoreIa) => {
    expect(final(scoreIa)).toBeGreaterThanOrEqual(30);
  });

  it("même chez un vendeur au profil irréprochable (remise maximale)", () => {
    for (const scoreIa of [null, 0, 10]) expect(final(scoreIa, 10)).toBeGreaterThanOrEqual(30);
  });
});
