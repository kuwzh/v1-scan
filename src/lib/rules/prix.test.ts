import { describe, expect, it } from "vitest";
import { donneesExtraitesVides, type ExtractedData } from "../contracts/extracted";
import { REFERENCES_PRIX, evaluerPrix, trouverReferencePrix } from "./prix";
import { normaliserTexte } from "./texte";

function donnees(annonce: Partial<ExtractedData["annonce"]>): ExtractedData {
  const d = donneesExtraitesVides();
  Object.assign(d.annonce, annonce);
  return d;
}
const ids = (d: ExtractedData) => evaluerPrix(d).map((c) => c.id);

describe("trouverReferencePrix", () => {
  it("reconnaît la marque dans le champ marque ou dans le titre", () => {
    expect(trouverReferencePrix(donnees({ marque: "Louis Vuitton" }).annonce)?.id).toBe(
      "louis-vuitton",
    );
    expect(trouverReferencePrix(donnees({ titre: "Sac Gucci Marmont" }).annonce)?.id).toBe("gucci");
  });

  it("reconnaît un produit sans marque (iPhone, PS5)", () => {
    expect(trouverReferencePrix(donnees({ titre: "iPhone 13 128 Go" }).annonce)?.id).toBe("iphone");
    expect(trouverReferencePrix(donnees({ titre: "Console PS5 + manette" }).annonce)?.id).toBe(
      "ps5",
    );
  });

  it("exige le produit en plus de la marque quand c'est prévu", () => {
    expect(
      trouverReferencePrix(donnees({ marque: "Nintendo", titre: "Jeu Mario" }).annonce),
    ).toBeNull();
    expect(
      trouverReferencePrix(donnees({ marque: "Nintendo", titre: "Console Switch OLED" }).annonce)
        ?.id,
    ).toBe("switch");
  });

  it("ne confond pas un mot qui en contient un autre", () => {
    expect(trouverReferencePrix(donnees({ titre: "Diorama de Noël" }).annonce)).toBeNull();
    expect(trouverReferencePrix(donnees({ titre: "Pull rolexa" }).annonce)).toBeNull();
  });

  it("renvoie null sans marque ni titre", () => {
    expect(trouverReferencePrix(donnees({}).annonce)).toBeNull();
  });
});

describe("evaluerPrix", () => {
  const sac = (prix: number | null, extra: Partial<ExtractedData["annonce"]> = {}) =>
    donnees({
      titre: "Sac Louis Vuitton Neverfull",
      marque: "Louis Vuitton",
      prix_eur: prix,
      ...extra,
    });

  it("très bas sous 20 % du prix de référence, bas sous 40 %, rien au-dessus", () => {
    expect(ids(sac(25))).toEqual(["prix.tres_bas"]); // 25 / 150 = 17 %
    expect(ids(sac(45))).toEqual(["prix.bas"]); // 30 %
    expect(ids(sac(60))).toEqual([]); // 40 % pile : pas encore anormal
    expect(ids(sac(480))).toEqual([]);
  });

  it("ne dit rien sans prix", () => {
    expect(ids(sac(null))).toEqual([]);
  });

  it("le libellé donne le prix et la marque", () => {
    const [c] = evaluerPrix(sac(25));
    expect(c?.label).toContain("25 €");
    expect(c?.label).toContain("Louis Vuitton");
    expect(evaluerPrix(sac(12.5))[0]?.label).toContain("12,50 €");
  });

  it.each([
    "Coque iPhone 15 Pro",
    "iPhone 12 HS pour pièces",
    "Écran iPhone 13 neuf",
    "Chargeur iPhone 20 W",
    "iPhone 11 cassé",
    "iPhone 8 bloqué iCloud",
    "Sac style Louis Vuitton",
    "Réplique Rolex Submariner",
    "Bracelet Apple Watch",
    "Boîte vide iPhone 14",
    "Lot de 3 coques AirPods",
  ])("explique un prix bas sans rien de suspect : %s", (titre) => {
    expect(ids(donnees({ titre, prix_eur: 5 }))).toEqual([]);
  });

  it("une description qui parle de panne ou de pièces suffit aussi", () => {
    expect(
      ids(
        donnees({ titre: "iPhone 13", prix_eur: 20, description: "Ne s'allume plus, à réparer." }),
      ),
    ).toEqual([]);
  });

  it("repère un iPhone ou une PS5 à prix cassé", () => {
    const iphone = (prix: number) =>
      ids(donnees({ titre: "iPhone 14 Pro 256 Go", prix_eur: prix }));
    const ps5 = (prix: number) => ids(donnees({ titre: "PS5 édition standard", prix_eur: prix }));
    expect(iphone(15)).toEqual(["prix.tres_bas"]); // 15 % de la référence
    expect(iphone(30)).toEqual(["prix.bas"]); // 30 %
    expect(iphone(40)).toEqual([]); // 40 % pile : pas encore anormal
    expect(ps5(60)).toEqual(["prix.bas"]); // 33 %
    expect(ps5(100)).toEqual([]); // 56 %
  });
});

describe("données de référence", () => {
  it("ids uniques, prix positifs", () => {
    expect(new Set(REFERENCES_PRIX.map((r) => r.id)).size).toBe(REFERENCES_PRIX.length);
    for (const r of REFERENCES_PRIX) expect(r.prixMin, r.id).toBeGreaterThan(0);
  });

  it("marques et produits sont déjà normalisés (minuscules, sans accents)", () => {
    for (const r of REFERENCES_PRIX) {
      for (const mot of [...r.marques, ...(r.produits ?? [])]) {
        expect(mot, r.id).toBe(normaliserTexte(mot));
      }
      expect(r.marques.length + (r.produits?.length ?? 0), r.id).toBeGreaterThan(0);
    }
  });
});
