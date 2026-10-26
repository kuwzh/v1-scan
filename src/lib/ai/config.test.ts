import { describe, expect, it } from "vitest";
import { MODELE_PAR_DEFAUT, lireConfigIa } from "./config";

describe("lireConfigIa", () => {
  it("Haiku 5.5, effort bas, 20 s : les valeurs par défaut", () => {
    expect(lireConfigIa({})).toEqual({
      apiKey: null,
      model: "claude-haiku-5-5",
      effort: "low",
      timeoutMs: 20_000,
      maxTokens: 6_000,
    });
    expect(MODELE_PAR_DEFAUT).toBe("claude-haiku-5-5");
  });

  it("change de modèle par la seule variable d'environnement", () => {
    expect(lireConfigIa({ ANTHROPIC_MODEL: "claude-sonnet-5-5" }).model).toBe("claude-sonnet-5-5");
  });

  it("lit la clé et l'effort", () => {
    const c = lireConfigIa({ ANTHROPIC_API_KEY: "  sk-test  ", ANTHROPIC_EFFORT: "medium" });
    expect(c.apiKey).toBe("sk-test");
    expect(c.effort).toBe("medium");
  });

  it("retombe sur la valeur par défaut quand une valeur est invalide", () => {
    const c = lireConfigIa({
      ANTHROPIC_MODEL: "gpt-4; rm -rf /",
      ANTHROPIC_EFFORT: "turbo",
      ANTHROPIC_TIMEOUT_MS: "abc",
      ANTHROPIC_MAX_TOKENS: "1000000",
      ANTHROPIC_API_KEY: "   ",
    });
    expect(c).toEqual(lireConfigIa({}));
  });

  it("borne le délai", () => {
    expect(lireConfigIa({ ANTHROPIC_TIMEOUT_MS: "100" }).timeoutMs).toBe(20_000);
    expect(lireConfigIa({ ANTHROPIC_TIMEOUT_MS: "15000" }).timeoutMs).toBe(15_000);
  });
});
