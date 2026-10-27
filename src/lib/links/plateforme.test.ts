import { describe, expect, it } from "vitest";
import { analyserLien } from "./analyse";
import { plateformeDeLien } from "./plateforme";

const de = (lien: string) => plateformeDeLien(analyserLien(lien));

describe("plateformeDeLien", () => {
  it.each([
    ["https://www.vinted.fr/items/123456-sac-lv", "vinted"],
    ["vinted.fr/items/9", "vinted"],
    ["https://www.vinted.com/items/55", "vinted"],
    ["https://www.leboncoin.fr/ad/vetements/2987654321", "leboncoin"],
    ["https://m.facebook.com/marketplace/item/123456/", "facebook_marketplace"],
    ["https://www.facebook.com/marketplace/item/123456", "facebook_marketplace"],
  ])("%s → %s", (lien, attendu) => {
    expect(de(lien)).toBe(attendu);
  });

  it.each([
    "https://vinted.fr.paiement-securise.com/items/1",
    "https://vinted-paiement.com/items/1",
    "https://leboncoin.fr-livraison.xyz/ad/1",
    "https://example-boutique.com/marketplace/1",
    "https://www.facebook.com/profile.php?id=1",
    "https://www.facebook.com/",
    "https://www.paypal.com/fr/home",
    "n'importe quoi",
  ])("%s → pas un lien d'annonce", (lien) => {
    expect(de(lien)).toBeNull();
  });

  it("un faux lien qui imite Vinted n'est jamais pris pour une annonce Vinted", () => {
    const analyse = analyserLien("https://vinted.fr.paiement-securise.com/items/1");
    expect(analyse.verdict).toBe("suspect");
    expect(plateformeDeLien(analyse)).toBeNull();
  });
});
