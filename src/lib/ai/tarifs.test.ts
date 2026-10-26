import { describe, expect, it } from "vitest";
import { TARIFS_MODELES, estimerCout, estimerCoutMaximal } from "./tarifs";

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
