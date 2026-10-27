import { describe, expect, it } from "vitest";
import { lireConfigPrix } from "./config";

const analyse = { model: "claude-haiku-5-5" };

describe("lireConfigPrix", () => {
  it("valeurs par défaut : le modèle de l'analyse, 3 recherches, 5/h, 15/j, cache 24 h", () => {
    expect(lireConfigPrix({}, analyse)).toEqual({
      modele: "claude-haiku-5-5",
      effort: "medium",
      maxRecherches: 3,
      maxTokens: 3_000,
      timeoutMs: 50_000,
      limiteParHeure: 5,
      limiteParJour: 15,
      ttlCacheS: 86_400,
    });
  });

  it("le modèle de recherche peut différer de celui de l'analyse", () => {
    expect(lireConfigPrix({ ANTHROPIC_PRICE_MODEL: "claude-sonnet-5-5" }, analyse).modele).toBe(
      "claude-sonnet-5-5",
    );
  });

  it("un modèle de forme invalide retombe sur celui de l'analyse", () => {
    for (const mauvais of ["", "  ", "pas un modèle !", "x".repeat(200)]) {
      expect(lireConfigPrix({ ANTHROPIC_PRICE_MODEL: mauvais }, analyse).modele).toBe(
        "claude-haiku-5-5",
      );
    }
  });

  it("l'effort est borné aux valeurs connues", () => {
    expect(lireConfigPrix({ ANTHROPIC_PRICE_EFFORT: "high" }, analyse).effort).toBe("high");
    expect(lireConfigPrix({ ANTHROPIC_PRICE_EFFORT: "turbo" }, analyse).effort).toBe("medium");
  });

  it.each([
    ["PRICE_SEARCH_MAX_USES", "maxRecherches", 1, 6, 3],
    ["PRICE_MAX_TOKENS", "maxTokens", 1_000, 8_000, 3_000],
    ["PRICE_TIMEOUT_MS", "timeoutMs", 10_000, 55_000, 50_000],
    ["PRICE_RATE_LIMIT_PER_HOUR", "limiteParHeure", 1, 100, 5],
    ["PRICE_RATE_LIMIT_PER_DAY", "limiteParJour", 1, 1_000, 15],
    ["PRICE_CACHE_TTL_S", "ttlCacheS", 60, 604_800, 86_400],
  ] as const)(
    "%s : bornée à [%i, %i], défaut %i si illisible",
    (variable, cle, min, max, defaut) => {
      const lire = (valeur: string) => lireConfigPrix({ [variable]: valeur }, analyse)[cle];
      expect(lire(String(min))).toBe(min);
      expect(lire(String(max))).toBe(max);
      expect(lire(String(min - 1))).toBe(defaut);
      expect(lire(String(max + 1))).toBe(defaut);
      expect(lire("beaucoup")).toBe(defaut);
      expect(lire("")).toBe(defaut);
    },
  );

  it("le délai total tient sous la durée maximale de la route (60 s)", () => {
    expect(lireConfigPrix({ PRICE_TIMEOUT_MS: "90000" }, analyse).timeoutMs).toBe(50_000);
    expect(lireConfigPrix({ PRICE_TIMEOUT_MS: "55000" }, analyse).timeoutMs).toBeLessThan(60_000);
  });
});
