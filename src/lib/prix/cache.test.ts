import { describe, expect, it } from "vitest";
import { StockageMemoire } from "../security";
import {
  LIBELLES_ETAT,
  TTL_ESTIMATION_S,
  TTL_INTROUVABLE_S,
  categoriserEtat,
  cleCachePrix,
  ecrireEstimationCache,
  lireEstimationCache,
} from "./cache";
import { estimationValide } from "./test-utils";

describe("categoriserEtat", () => {
  it.each([
    ["Neuf avec étiquette", "neuf"],
    ["neuf", "neuf"],
    ["Jamais porté", "neuf"],
    ["Sous blister", "neuf"],
    ["Comme neuf", "tres_bon"],
    ["Très bon état", "tres_bon"],
    ["Excellent état", "tres_bon"],
    ["Bon état", "bon"],
    ["bon", "bon"],
    ["Satisfaisant", "satisfaisant"],
    ["Traces d'usage", "satisfaisant"],
    ["Pour pièces", "pour_pieces"],
    ["HS", "pour_pieces"],
    ["en panne", "pour_pieces"],
    ["", "inconnu"],
    ["  ", "inconnu"],
    [null, "inconnu"],
    ["je ne sais pas", "inconnu"],
  ])("%j → %s", (etat, attendu) => {
    expect(categoriserEtat(etat)).toBe(attendu);
  });

  it("« comme neuf » n'est pas « neuf »", () => {
    expect(categoriserEtat("comme neuf")).not.toBe("neuf");
  });

  it("chaque catégorie a un libellé pour la recherche", () => {
    for (const e of [
      "neuf",
      "tres_bon",
      "bon",
      "satisfaisant",
      "pour_pieces",
      "inconnu",
    ] as const) {
      expect(LIBELLES_ETAT[e]).toBeTruthy();
    }
  });
});

describe("cleCachePrix : (marque, modèle, état)", () => {
  const cle = (
    marque: string,
    modele: string,
    etat: Parameters<typeof cleCachePrix>[0]["etat"] = "bon",
  ) => cleCachePrix({ marque, modele, etat });

  it("est stable, sans accents ni majuscules ni ponctuation", () => {
    expect(cle("Louis Vuitton", "Speedy 30")).toBe("prix:louis-vuitton:speedy-30:bon");
    expect(cle("  LOUIS   VUITTON ", "speedy-30!")).toBe(cle("Louis Vuitton", "Speedy 30"));
    expect(cle("Hermès", "Birkin")).toBe("prix:hermes:birkin:bon");
  });

  it("distingue marque, modèle et état", () => {
    expect(cle("Apple", "iPhone 13")).not.toBe(cle("Apple", "iPhone 14"));
    expect(cle("Apple", "iPhone 13", "bon")).not.toBe(cle("Apple", "iPhone 13", "neuf"));
  });

  it("ne peut pas produire une clé inattendue à partir de valeurs lues sur une capture", () => {
    const cleHostile = cle("a:b\n*", "limite:analyse:../../x ${1+1}");
    expect(cleHostile).toMatch(/^prix:[a-z0-9-]*:[a-z0-9-]*:bon$/);
    expect(cleHostile.split(":")).toHaveLength(4);
  });

  it("borne la longueur", () => {
    expect(cle("a".repeat(500), "b".repeat(500)).length).toBeLessThan(160);
  });
});

describe("cache d'estimations", () => {
  const horloge = { ms: 1_000_000 };
  const stockage = () => new StockageMemoire(() => horloge.ms);

  it("écrit puis relit une estimation, sources comprises", async () => {
    const s = stockage();
    await ecrireEstimationCache(s, "prix:x", estimationValide());
    const lu = await lireEstimationCache(s, "prix:x");
    expect(lu).toEqual({ trouve: true, estimation: estimationValide() });
  });

  it("absent → non trouvé", async () => {
    expect(await lireEstimationCache(stockage(), "prix:absent")).toEqual({ trouve: false });
  });

  it("expire au bout de 24 h", async () => {
    const s = stockage();
    await ecrireEstimationCache(s, "prix:x", estimationValide());
    horloge.ms += (TTL_ESTIMATION_S - 1) * 1000;
    expect((await lireEstimationCache(s, "prix:x")).trouve).toBe(true);
    horloge.ms += 2000;
    expect((await lireEstimationCache(s, "prix:x")).trouve).toBe(false);
  });

  it("un « introuvable » est gardé, moins longtemps", async () => {
    const s = stockage();
    await ecrireEstimationCache(s, "prix:y", null);
    expect(await lireEstimationCache(s, "prix:y")).toEqual({ trouve: true, estimation: null });
    horloge.ms += (TTL_INTROUVABLE_S + 1) * 1000;
    expect((await lireEstimationCache(s, "prix:y")).trouve).toBe(false);
  });

  it("une estimation de confiance basse est gardée aussi peu qu'un « introuvable »", async () => {
    const s = stockage();
    await ecrireEstimationCache(s, "prix:b", estimationValide({ confiance: "basse" }));
    horloge.ms += (TTL_INTROUVABLE_S - 1) * 1000;
    expect((await lireEstimationCache(s, "prix:b")).trouve).toBe(true);
    horloge.ms += 2000;
    expect((await lireEstimationCache(s, "prix:b")).trouve).toBe(false);
  });

  it("la durée se règle (PRICE_CACHE_TTL_S), sans dépasser celle d'un introuvable pour null", async () => {
    const s = stockage();
    await ecrireEstimationCache(s, "prix:z", estimationValide(), 600);
    horloge.ms += 601_000;
    expect((await lireEstimationCache(s, "prix:z")).trouve).toBe(false);
  });

  it("un enregistrement illisible ou de mauvaise forme compte pour absent (pas d'exception)", async () => {
    const s = stockage();
    await s.poser("prix:a", "pas du json", 60);
    await s.poser("prix:b", JSON.stringify({ estimation: { article: 3 } }), 60);
    await s.poser("prix:c", JSON.stringify({ autre: 1 }), 60);
    for (const cle of ["prix:a", "prix:b", "prix:c"]) {
      expect(await lireEstimationCache(s, cle)).toEqual({ trouve: false });
    }
  });

  it("ne stocke que l'estimation : ni le prix de l'annonce, ni rien de la conversation", async () => {
    const s = stockage();
    await ecrireEstimationCache(s, "prix:x", estimationValide());
    const brut = await s.lireTexte("prix:x");
    expect(Object.keys(JSON.parse(brut ?? "{}"))).toEqual(["estimation"]);
  });
});
