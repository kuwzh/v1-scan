import { describe, expect, it } from "vitest";
import { iaAutorisee, lireConfigSecurite } from "./config";

describe("lireConfigSecurite : valeurs de départ", () => {
  it("10 analyses/heure, 30/jour, 1 $/jour, compteur en cache 5 minutes", () => {
    const c = lireConfigSecurite({});
    expect(c).toMatchObject({
      limiteParHeure: 10,
      limiteParJour: 30,
      plafondJournalierUsd: 1,
      cacheCompteurS: 300,
      ipSecret: null,
      upstash: null,
      production: false,
    });
  });

  it("se règle par variables d'environnement", () => {
    const c = lireConfigSecurite({
      RATE_LIMIT_PER_HOUR: "20",
      RATE_LIMIT_PER_DAY: "100",
      DAILY_SPEND_CAP_USD: "12.5",
      COUNTER_CACHE_SECONDS: "60",
      IP_HASH_SECRET: " secret ",
      UPSTASH_REDIS_REST_URL: "https://x.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "tok",
      NODE_ENV: "production",
    });
    expect(c).toMatchObject({
      limiteParHeure: 20,
      limiteParJour: 100,
      plafondJournalierUsd: 12.5,
      cacheCompteurS: 60,
      ipSecret: "secret",
      upstash: { url: "https://x.upstash.io", token: "tok" },
      production: true,
    });
  });

  it.each(["", "  ", "abc", "-3", "0", "1.5", "99999", "NaN", "Infinity"])(
    "une limite horaire invalide (%j) retombe sur 10",
    (valeur) => {
      expect(lireConfigSecurite({ RATE_LIMIT_PER_HOUR: valeur }).limiteParHeure).toBe(10);
    },
  );

  it("un plafond à 0 est valide : il coupe l'IA", () => {
    expect(lireConfigSecurite({ DAILY_SPEND_CAP_USD: "0" }).plafondJournalierUsd).toBe(0);
  });

  it("une variable vide ne vaut pas 0 : un plafond vide garde la valeur par défaut", () => {
    expect(lireConfigSecurite({ DAILY_SPEND_CAP_USD: "" }).plafondJournalierUsd).toBe(1);
  });

  it.each(["abc", "-1", "Infinity", "1e9"])("un plafond invalide (%j) retombe sur 1", (valeur) => {
    expect(lireConfigSecurite({ DAILY_SPEND_CAP_USD: valeur }).plafondJournalierUsd).toBe(1);
  });

  it("accepte les noms KV_REST_API_* que l'intégration Vercel peut injecter", () => {
    const c = lireConfigSecurite({
      KV_REST_API_URL: "https://kv.upstash.io",
      KV_REST_API_TOKEN: "tk",
    });
    expect(c.upstash).toEqual({ url: "https://kv.upstash.io", token: "tk" });
  });

  it("les noms UPSTASH_REDIS_REST_* ont priorité, et une variable vide est ignorée", () => {
    const c = lireConfigSecurite({
      UPSTASH_REDIS_REST_URL: "https://a.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "",
      KV_REST_API_URL: "https://b.upstash.io",
      KV_REST_API_TOKEN: "kv-token",
    });
    expect(c.upstash).toEqual({ url: "https://a.upstash.io", token: "kv-token" });
  });

  it("ne lit jamais le jeton en lecture seule : il ne permet pas d'écrire", () => {
    const c = lireConfigSecurite({
      KV_REST_API_URL: "https://kv.upstash.io",
      KV_REST_API_READ_ONLY_TOKEN: "lecture-seule",
    });
    expect(c.upstash).toBeNull();
  });

  it("Upstash exige l'URL ET le jeton", () => {
    expect(lireConfigSecurite({ UPSTASH_REDIS_REST_URL: "https://x" }).upstash).toBeNull();
    expect(lireConfigSecurite({ UPSTASH_REDIS_REST_TOKEN: "t" }).upstash).toBeNull();
  });
});

describe("diagnosticDetaille : le détail technique est montré partout, sauf SHOW_DIAGNOSTICS=false", () => {
  const detaille = (env: Record<string, string>) => lireConfigSecurite(env).diagnosticDetaille;

  it("oui par défaut, en développement comme en preview comme en production", () => {
    expect(detaille({})).toBe(true);
    expect(detaille({ NODE_ENV: "development" })).toBe(true);
    expect(detaille({ NODE_ENV: "production", VERCEL_ENV: "preview" })).toBe(true);
    expect(detaille({ NODE_ENV: "production", VERCEL_ENV: "production" })).toBe(true);
  });

  it("SHOW_DIAGNOSTICS=false le masque (à mettre avant d'ouvrir l'app au public)", () => {
    expect(detaille({ NODE_ENV: "production", SHOW_DIAGNOSTICS: "false" })).toBe(false);
    expect(detaille({ SHOW_DIAGNOSTICS: " FALSE " })).toBe(false);
  });

  it("toute autre valeur garde le détail", () => {
    expect(detaille({ SHOW_DIAGNOSTICS: "true" })).toBe(true);
    expect(detaille({ SHOW_DIAGNOSTICS: "peut-être" })).toBe(true);
    expect(detaille({ SHOW_DIAGNOSTICS: "" })).toBe(true);
  });
});

describe("environnement et présence des variables Upstash", () => {
  it("VERCEL_ENV distingue preview et production (NODE_ENV vaut « production » pour les deux)", () => {
    const e = (env: Record<string, string>) => lireConfigSecurite(env).environnement;
    expect(e({ NODE_ENV: "production", VERCEL_ENV: "preview" })).toBe("preview");
    expect(e({ NODE_ENV: "production", VERCEL_ENV: "production" })).toBe("production");
    expect(e({ NODE_ENV: "production" })).toBe("production");
    expect(e({})).toBe("development");
    expect(e({ NODE_ENV: "production", VERCEL_ENV: "n'importe quoi" })).toBe("production");
  });

  it("dit laquelle des deux variables Upstash est présente", () => {
    const c = lireConfigSecurite({ UPSTASH_REDIS_REST_URL: "https://x" });
    expect([c.upstashUrlPresente, c.upstashJetonPresent]).toEqual([true, false]);
    const d = lireConfigSecurite({ KV_REST_API_TOKEN: "t" });
    expect([d.upstashUrlPresente, d.upstashJetonPresent]).toEqual([false, true]);
  });
});

describe("iaAutorisee", () => {
  const base = lireConfigSecurite({});

  it("en développement, le repli en mémoire suffit", () => {
    expect(iaAutorisee(base)).toEqual({ autorisee: true });
  });

  it("en production, sans stockage partagé, l'IA reste coupée", () => {
    expect(iaAutorisee({ ...base, production: true, ipSecret: "s" })).toEqual({
      autorisee: false,
      motif: "stockage_non_partage",
    });
  });

  it("en production, sans secret pour hasher les IP, l'IA reste coupée", () => {
    expect(iaAutorisee({ ...base, production: true, upstash: { url: "u", token: "t" } })).toEqual({
      autorisee: false,
      motif: "secret_manquant",
    });
  });

  it("en production, correctement configurée, l'IA est autorisée", () => {
    expect(
      iaAutorisee({ ...base, production: true, ipSecret: "s", upstash: { url: "u", token: "t" } }),
    ).toEqual({ autorisee: true });
  });
});
