import { describe, expect, it } from "vitest";
import { CODES_ERREUR } from "../contracts/errors";
import { GRAVITES } from "../contracts/signals";
import { NIVEAUX } from "../contracts/niveau";
import { fr } from "./fr";
import { contientFormulationInterdite, trouverFormulationsInterdites } from "./wording";

function toutesLesChaines(valeur: unknown): string[] {
  if (typeof valeur === "string") return [valeur];
  if (Array.isArray(valeur)) return valeur.flatMap(toutesLesChaines);
  if (valeur && typeof valeur === "object") return Object.values(valeur).flatMap(toutesLesChaines);
  return [];
}

describe("textes français", () => {
  it("ne contiennent aucune formulation accusatoire ni promesse de sécurité", () => {
    for (const texte of toutesLesChaines(fr)) {
      expect(trouverFormulationsInterdites(texte), texte).toEqual([]);
    }
  });

  it("couvrent tous les niveaux, gravités et codes d'erreur", () => {
    for (const n of NIVEAUX) expect(fr.niveaux[n].titre).toBeTruthy();
    for (const g of GRAVITES) expect(fr.gravites[g]).toBeTruthy();
    for (const c of CODES_ERREUR) expect(fr.erreurs[c]).toBeTruthy();
    for (const n of NIVEAUX) expect(fr.conseilsParDefaut[n].length).toBeGreaterThan(0);
  });

  it("n'ont pas de texte vide", () => {
    for (const texte of toutesLesChaines(fr)) expect(texte.trim()).not.toBe("");
  });

  it("rappellent que l'outil ne garantit rien", () => {
    expect(fr.disclaimer).toContain("ne garantit rien");
  });
});

describe("garde-fou de wording", () => {
  it.each([
    "C'est un arnaqueur",
    "Ce vendeur est un escroc",
    "c'est une arnaque",
    "C’est clairement une arnaque",
    "contrefaçon avérée",
    "Aucun risque avec ce vendeur",
    "Vendeur 100 % fiable",
    "un fraudeur connu",
  ])("repère « %s »", (texte) => {
    expect(contientFormulationInterdite(texte)).toBe(true);
  });

  it.each([
    "Signal d'alerte : le vendeur propose de passer sur WhatsApp.",
    "Le lien imite le nom d'une plateforme connue.",
    "Ce type de message ressemble à un scénario d'arnaque courant.",
    "Un risque faible ne veut pas dire sans risque.",
    "Le prix est inhabituellement bas pour cette marque.",
  ])("laisse passer « %s »", (texte) => {
    expect(contientFormulationInterdite(texte)).toBe(false);
  });
});

describe("textes de la comparaison de prix", () => {
  it("formatent les montants à la française, espace insécable avant « € »", () => {
    expect(fr.prix.neuf(1_800)).toBe("Prix neuf estimé ~1 800 €");
    expect(fr.prix.neuf(45)).toBe("Prix neuf estimé ~45 €");
    expect(fr.prix.neuf(1_234_567.5)).toBe("Prix neuf estimé ~1 234 567,50 €");
    expect(fr.prix.occasion(700, 1_100)).toBe("Occasion habituelle ~700–1 100 €");
    expect(fr.prix.occasion(1_200, 2_000)).toBe("Occasion habituelle ~1 200–2 000 €");
  });

  it("disent l'écart au prix d'occasion habituel, avec un vrai signe moins", () => {
    expect(fr.prix.ecart(-72, 250)).toBe(
      "Cette annonce (250 €) est à −72 % du prix d'occasion habituel",
    );
    expect(fr.prix.ecart(0, 900)).toBe("Cette annonce (900 €) est au prix d'occasion habituel");
    expect(fr.prix.ecart(35, 1_215)).toBe(
      "Cette annonce (1 215 €) est à +35 % du prix d'occasion habituel",
    );
  });

  it("rappellent que c'est une estimation, et qu'un prix bas n'est pas une preuve", () => {
    expect(fr.prix.estimation).toMatch(/estimation/i);
    expect(fr.prix.mention).toMatch(/estimation/i);
    expect(fr.prix.mention).toMatch(/abîmé|mal identifié/);
  });
});
