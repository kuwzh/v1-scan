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
