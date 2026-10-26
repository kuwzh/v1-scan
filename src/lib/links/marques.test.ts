import { describe, expect, it } from "vitest";
import { analyserHote } from "./domain";
import { HEBERGEMENTS_OUVERTS, RACCOURCISSEURS, TLD_SUSPECTS } from "./listes";
import { DOMAINES_SURS, MARQUES, OFFICIELS } from "./marques";
import { compacter } from "./similarite";

/** Garde-fous sur les données : une faute de frappe ici serait un faux positif ou négatif. */
describe("données des marques", () => {
  it("chaque domaine officiel est un domaine enregistrable (PSL)", () => {
    for (const domaine of OFFICIELS.keys()) {
      const h = analyserHote(domaine);
      expect(h.domaine, domaine).toBe(domaine);
      expect(h.suffixePrive, domaine).toBe(false);
    }
  });

  it("aucun domaine officiel n'est déclaré deux fois", () => {
    const tous = MARQUES.flatMap((m) => m.officiels);
    expect(new Set(tous).size).toBe(tous.length);
  });

  it("les identifiants de marque sont uniques", () => {
    const ids = MARQUES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("les mots-clés sont déjà sous leur forme compacte", () => {
    for (const marque of MARQUES) {
      expect(marque.mots.length, marque.id).toBeGreaterThan(0);
      for (const mot of marque.mots) {
        expect(mot, marque.id).toBe(compacter(mot));
        expect(mot.length, mot).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("les marques demandées sont toutes présentes", () => {
    const ids = MARQUES.map((m) => m.id);
    for (const attendu of [
      "vinted",
      "leboncoin",
      "mondialrelay",
      "colissimo",
      "chronopost",
      "dpd",
      "relaiscolis",
      "laposte",
      "paypal",
      "lydia",
      "bnpparibas",
      "societegenerale",
      "creditagricole",
      "labanquepostale",
      "boursorama",
    ]) {
      expect(ids).toContain(attendu);
    }
    for (const domaine of [
      "vinted.fr",
      "leboncoin.fr",
      "mondialrelay.fr",
      "laposte.fr",
      "colissimo.fr",
      "chronopost.fr",
      "dpd.fr",
      "relaiscolis.com",
      "paypal.com",
      "lydia-app.com",
    ]) {
      expect(OFFICIELS.has(domaine), domaine).toBe(true);
    }
  });

  it("les domaines sûrs sont enregistrables et distincts des officiels", () => {
    for (const domaine of DOMAINES_SURS) {
      expect(analyserHote(domaine).domaine, domaine).toBe(domaine);
      expect(OFFICIELS.has(domaine), domaine).toBe(false);
    }
  });
});

describe("listes", () => {
  it("les raccourcisseurs sont des domaines enregistrables", () => {
    for (const domaine of RACCOURCISSEURS) {
      expect(analyserHote(domaine).domaine, domaine).toBe(domaine);
    }
  });

  it("les TLD suspects existent dans la PSL, en minuscules", () => {
    for (const tld of TLD_SUSPECTS) {
      expect(tld).toBe(tld.toLowerCase());
      expect(analyserHote(`exemple.${tld}`).suffixeConnu, tld).toBe(true);
    }
  });

  it("les hébergements ouverts sont des hôtes valides", () => {
    for (const hote of HEBERGEMENTS_OUVERTS) {
      expect(analyserHote(hote).suffixeConnu, hote).toBe(true);
    }
  });
});
