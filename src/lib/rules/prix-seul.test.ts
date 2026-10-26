import { describe, expect, it } from "vitest";
import { completerConfiance, donneesExtraitesVides } from "../contracts/extracted";
import { rangGravite } from "../contracts/signals";
import { CATALOGUE } from "./catalog";
import { evaluerRegles } from "./moteur";
import { REFERENCES_PRIX } from "./prix";

/** Le prix, à lui seul, ne peut jamais imposer un plancher : au plus « importante ». */
describe("signal de prix : jamais critique", () => {
  const evaluerPrix = (titre: string, prix: number) => {
    const d = donneesExtraitesVides();
    d.plateforme = "vinted";
    d.annonce.titre = titre;
    d.annonce.prix_eur = prix;
    return evaluerRegles({ donnees: completerConfiance(d, "haute"), liens: [] });
  };

  it.each(REFERENCES_PRIX.map((r) => [r.nom, r] as const))(
    "%s : même à 0 €, au plus « importante » et aucun plancher",
    (_nom, ref) => {
      const mot = ref.marques[0] ?? ref.produits?.[0] ?? ref.nom;
      const produit = ref.produits?.[0] ?? "";
      for (const prix of [0, 0.01, 1, Math.floor(ref.prixMin * 0.19)]) {
        const r = evaluerPrix(`${mot} ${produit}`.trim(), prix);
        const prixSignaux = r.constats.filter((c) => c.id.startsWith("prix."));
        expect(prixSignaux, `${ref.id} à ${prix} €`).toHaveLength(1);
        for (const c of prixSignaux) {
          expect(rangGravite(c.gravite)).toBeLessThanOrEqual(rangGravite("importante"));
          expect(c.plancher).toBeUndefined();
        }
        expect(r.plancher).toBeNull();
        expect(r.score).toBeLessThan(60 + 1); // un seul signal de prix : jamais d'« élevé » à lui seul
      }
    },
  );

  it("aucune règle du catalogue de prix ne sait produire « critique »", () => {
    const source = CATALOGUE.find((r) => r.nom === "prix");
    expect(source).toBeDefined();
    const d = donneesExtraitesVides();
    d.annonce.titre = "Rolex Submariner";
    d.annonce.prix_eur = 0;
    const constats = source!.evaluer({
      donnees: completerConfiance(d, "haute"),
      ignorees: [],
      plateforme: null,
      plateformeLocale: false,
      segments: [],
      messages: [],
      liens: [],
      liensNonOfficiels: [],
      liensSuspects: [],
    });
    expect(constats.every((c) => c.gravite !== "critique")).toBe(true);
  });

  it("le poids d'un signal de prix le garde sous le niveau « élevé » à lui seul", () => {
    expect(evaluerPrix("Rolex Submariner", 1).score).toBe(38);
  });
});
