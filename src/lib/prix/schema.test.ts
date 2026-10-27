import { describe, expect, it } from "vitest";
import { depuisReponseEstimation, normaliserUrl } from "./schema";
import { REPONSE_VALIDE, URL_BRAND, URL_VESTIAIRE, URL_VINTED } from "./test-utils";

const trouvees = new Set([URL_BRAND, URL_VESTIAIRE, URL_VINTED].map((u) => normaliserUrl(u) ?? ""));

describe("normaliserUrl", () => {
  it.each([
    ["https://www.Vinted.fr/catalog?search_text=a", "vinted.fr/catalog?search_text=a"],
    ["https://vinted.fr/catalog/#haut", "vinted.fr/catalog"],
    ["https://exemple.fr/a/b///", "exemple.fr/a/b"],
    ["  https://exemple.fr/a  ", "exemple.fr/a"],
  ])("%s → %s", (brut, canonique) => expect(normaliserUrl(brut)).toBe(canonique));

  it.each([
    "http://exemple.fr/a",
    "ftp://exemple.fr/a",
    "javascript:alert(1)",
    "https://user:mdp@exemple.fr/a",
    "https://127.0.0.1/a",
    "https://[::1]/a",
    "https://localhost/a",
    "pas une url",
    "",
  ])("refuse %j", (brut) => expect(normaliserUrl(brut)).toBeNull());
});

describe("depuisReponseEstimation", () => {
  const depuis = (partiel = {}, urls: ReadonlySet<string> = trouvees) =>
    depuisReponseEstimation({ ...REPONSE_VALIDE, ...partiel }, urls);

  it("remet une réponse valide sous la forme du contrat", () => {
    expect(depuis()).toEqual({
      article: "Louis Vuitton Speedy 30 Monogram",
      prix_neuf_eur: 1_800,
      occasion_min_eur: 700,
      occasion_max_eur: 1_100,
      confiance: "haute",
      sources: REPONSE_VALIDE.sources,
      remarque: null,
    });
  });

  it("confiance « aucune » → null", () => {
    expect(depuis({ confiance: "aucune" })).toBeNull();
  });

  it("aucun prix exploitable → null", () => {
    expect(depuis({ prix_neuf_eur: 0, occasion_min_eur: 0, occasion_max_eur: 0 })).toBeNull();
  });

  it("garde un prix neuf seul (sans fourchette d'occasion : pas de comparaison possible)", () => {
    expect(depuis({ occasion_min_eur: 0, occasion_max_eur: 0 })).toMatchObject({
      prix_neuf_eur: 1_800,
      occasion_min_eur: null,
      occasion_max_eur: null,
    });
  });

  it("une fourchette incomplète est abandonnée en entier", () => {
    expect(depuis({ occasion_max_eur: 0 })).toMatchObject({
      occasion_min_eur: null,
      occasion_max_eur: null,
    });
  });

  it("remet une fourchette inversée dans l'ordre", () => {
    expect(depuis({ occasion_min_eur: 1_100, occasion_max_eur: 700 })).toMatchObject({
      occasion_min_eur: 700,
      occasion_max_eur: 1_100,
    });
  });

  it.each([-5, Number.NaN, Number.POSITIVE_INFINITY, 5_000_000])(
    "refuse le prix absurde %s",
    (prix) => {
      expect(depuis({ prix_neuf_eur: prix })?.prix_neuf_eur).toBeNull();
    },
  );

  it("arrondit les prix au centime", () => {
    expect(depuis({ occasion_min_eur: 699.999 })?.occasion_min_eur).toBe(700);
  });

  it("fourchette d'occasion bien au-dessus du prix neuf : confiance « basse » et remarque", () => {
    const e = depuis({ prix_neuf_eur: 500, occasion_min_eur: 900, occasion_max_eur: 1_100 });
    expect(e?.confiance).toBe("basse");
    expect(e?.remarque).toMatch(/dépasse le prix neuf/);
  });

  it("une occasion légèrement au-dessus du neuf (pièce recherchée) reste acceptée", () => {
    expect(depuis({ prix_neuf_eur: 1_000, occasion_max_eur: 1_200 })?.confiance).toBe("haute");
  });

  it("ne garde qu'une fois une même page, et au plus 5 sources", () => {
    const urls = Array.from({ length: 8 }, (_, i) => `https://site${i}.fr/p`);
    const e = depuisReponseEstimation(
      {
        ...REPONSE_VALIDE,
        sources: [
          { url: urls[0] ?? "", titre: "a" },
          { url: `${urls[0]}/`, titre: "doublon" },
          ...urls.map((url, i) => ({ url, titre: `t${i}` })),
        ],
      },
      new Set(urls.map((u) => normaliserUrl(u) ?? "")),
    );
    expect(e?.sources).toHaveLength(5);
    expect(new Set(e?.sources.map((s) => s.url)).size).toBe(5);
  });

  it("nettoie le titre des sources et la remarque (une ligne, sans balise, bornés)", () => {
    const e = depuis({
      sources: [{ url: URL_BRAND, titre: "<b>Titre</b>\n" + "x".repeat(500) }],
      remarque: "Attention\n\n<script>" + "y".repeat(500),
    });
    expect(e?.sources[0]?.titre).not.toMatch(/[<>\n]/);
    expect(e?.sources[0]?.titre.length).toBeLessThanOrEqual(120);
    expect(e?.remarque).not.toMatch(/[<>\n]/);
    expect(e?.remarque?.length).toBeLessThanOrEqual(200);
  });

  it("article vide : libellé neutre", () => {
    expect(depuis({ article_identifie: "  " })?.article).toBe("Article");
  });
});
