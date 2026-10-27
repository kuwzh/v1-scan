import { describe, expect, it } from "vitest";
import {
  PRIX_RECHERCHE_WEB_USD,
  TARIFS_MODELES,
  estimerCout,
  estimerCoutMaximal,
  estimerCoutRecherche,
  estimerCoutRechercheMaximal,
} from "./tarifs";

const pire = { images: 3, caracteresTexte: 8_000, maxTokens: 6_000 };

describe("estimerCoutMaximal", () => {
  it("est au moins égal au coût réel d'une grosse analyse", () => {
    const reel = estimerCout("claude-haiku-5-5", {
      entree: 9_000,
      sortie: 2_500,
      cacheLecture: 0,
      cacheEcriture: 0,
    });
    expect(reel).not.toBeNull();
    expect(estimerCoutMaximal("claude-haiku-5-5", pire)).toBeGreaterThan(reel ?? 0);
  });

  it("reste de l'ordre du demi-centime sur Haiku : 5 $ couvrent plus de 1 000 analyses", () => {
    const c = estimerCoutMaximal("claude-haiku-5-5", pire);
    expect(c).toBeGreaterThan(0.001);
    expect(c).toBeLessThan(0.01);
  });

  it("croît avec les captures, le texte et la taille de réponse autorisée", () => {
    const base = estimerCoutMaximal("claude-haiku-5-5", {
      images: 0,
      caracteresTexte: 0,
      maxTokens: 1_000,
    });
    expect(
      estimerCoutMaximal("claude-haiku-5-5", { images: 1, caracteresTexte: 0, maxTokens: 1_000 }),
    ).toBeGreaterThan(base);
    expect(
      estimerCoutMaximal("claude-haiku-5-5", {
        images: 0,
        caracteresTexte: 5_000,
        maxTokens: 1_000,
      }),
    ).toBeGreaterThan(base);
    expect(
      estimerCoutMaximal("claude-haiku-5-5", { images: 0, caracteresTexte: 0, maxTokens: 9_000 }),
    ).toBeGreaterThan(base);
  });

  it("un modèle inconnu est compté au tarif connu le plus cher : on réserve trop plutôt que pas assez", () => {
    const inconnu = estimerCoutMaximal("claude-modele-futur-9", pire);
    for (const nom of Object.keys(TARIFS_MODELES)) {
      expect(inconnu).toBeGreaterThanOrEqual(estimerCoutMaximal(nom, pire));
    }
  });
});

describe("coût d'une recherche web", () => {
  const usage = (recherchesWeb: number) => ({
    entree: 15_000,
    sortie: 700,
    cacheLecture: 0,
    cacheEcriture: 0,
    recherchesWeb,
  });

  it("une recherche coûte 0,01 $ (10 $ les 1 000)", () => {
    expect(PRIX_RECHERCHE_WEB_USD).toBe(0.01);
  });

  it("coût réel = jetons + recherches facturées", () => {
    const jetons = estimerCout("claude-haiku-5-5", usage(0));
    expect(estimerCoutRecherche("claude-haiku-5-5", usage(0))).toBeCloseTo(jetons ?? 0, 9);
    expect(estimerCoutRecherche("claude-haiku-5-5", usage(3))).toBeCloseTo((jetons ?? 0) + 0.03, 9);
    // 15 000 × 0,10 $/M + 700 × 0,50 $/M + 2 × 0,01 $
    expect(estimerCoutRecherche("claude-haiku-5-5", usage(2))).toBeCloseTo(0.02185, 6);
  });

  it("modèle sans tarif connu : coût inconnu (null), la réservation est alors gardée", () => {
    expect(estimerCoutRecherche("modele-inconnu", usage(2))).toBeNull();
  });

  it("le maximum couvre les recherches permises, un contexte plein et la réponse maximale", () => {
    // 3 × 0,01 + 60 000 × 0,10 $/M + 3 000 × 0,50 $/M
    expect(
      estimerCoutRechercheMaximal("claude-haiku-5-5", { maxRecherches: 3, maxTokens: 3_000 }),
    ).toBeCloseTo(0.0375, 6);
  });

  it("le maximum dépasse le coût réel d'une grosse estimation", () => {
    const reel = estimerCoutRecherche("claude-haiku-5-5", {
      entree: 50_000,
      sortie: 2_500,
      cacheLecture: 0,
      cacheEcriture: 0,
      recherchesWeb: 3,
    });
    expect(
      estimerCoutRechercheMaximal("claude-haiku-5-5", { maxRecherches: 3, maxTokens: 3_000 }),
    ).toBeGreaterThan(reel ?? Infinity);
  });

  it("un modèle inconnu est compté au tarif le plus cher connu", () => {
    const entree = { maxRecherches: 3, maxTokens: 3_000 };
    expect(estimerCoutRechercheMaximal("modele-inconnu", entree)).toBeCloseTo(
      estimerCoutRechercheMaximal("claude-opus-5-5", entree),
      9,
    );
  });

  it("croît avec le nombre de recherches permises", () => {
    const a = estimerCoutRechercheMaximal("claude-haiku-5-5", {
      maxRecherches: 1,
      maxTokens: 3_000,
    });
    const b = estimerCoutRechercheMaximal("claude-haiku-5-5", {
      maxRecherches: 6,
      maxTokens: 3_000,
    });
    expect(b - a).toBeCloseTo(0.05, 9);
  });
});
