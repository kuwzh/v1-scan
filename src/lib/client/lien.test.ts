import { describe, expect, it } from "vitest";
import { analyserLien } from "../links/analyse";
import { plateformeDeLien } from "../links/plateforme";
import { detecterLienAnnonce } from "./lien";

describe("detecterLienAnnonce", () => {
  it.each([
    ["https://www.vinted.fr/items/123456-sac-lv", "vinted"],
    ["vinted.fr/items/9", "vinted"],
    ["  https://www.vinted.com/items/55  ", "vinted"],
    ["https://www.vinted.co.uk/items/1", "vinted"],
    ["HTTPS://WWW.VINTED.FR/items/1", "vinted"],
    ["https://www.leboncoin.fr/ad/vetements/2987654321", "leboncoin"],
    ["https://m.leboncoin.fr/ad/1", "leboncoin"],
    ["https://www.facebook.com/marketplace/item/123456", "facebook_marketplace"],
    ["m.facebook.com/marketplace/item/1/", "facebook_marketplace"],
    ["https://www.vinted.fr/items/1 voici l'annonce", "vinted"],
  ])("%s → %s", (saisie, attendu) => {
    expect(detecterLienAnnonce(saisie)).toBe(attendu);
  });

  it.each([
    "",
    "   ",
    "n'importe quoi",
    "https://vinted.fr.paiement-securise.com/items/1",
    "https://vinted-paiement.com/items/1",
    "https://leboncoin.fr-livraison.xyz/ad/1",
    "https://notvinted.fr/items/1",
    "https://vinted.fr.evil.com/",
    "https://www.facebook.com/profile.php?id=1",
    "https://www.facebook.com/",
    "https://example.com/marketplace/1",
    "https://www.paypal.com/fr/home",
    "javascript:alert(1)",
    "ftp://vinted.fr/x",
    "https://vіnted.fr/items/1",
  ])("%j → pas une annonce", (saisie) => {
    expect(detecterLienAnnonce(saisie)).toBeNull();
  });

  it("s'accorde avec l'analyse du serveur sur les liens courants", () => {
    for (const lien of [
      "https://www.vinted.fr/items/123456-sac-lv",
      "https://www.leboncoin.fr/ad/vetements/2987654321",
      "https://www.facebook.com/marketplace/item/123456",
      "https://vinted.fr.paiement-securise.com/items/1",
      "https://vinted-paiement.com/items/1",
      "https://example-boutique.com/pay",
    ]) {
      expect(detecterLienAnnonce(lien), lien).toBe(plateformeDeLien(analyserLien(lien)));
    }
  });
});
