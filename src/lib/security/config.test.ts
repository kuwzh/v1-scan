import { describe, expect, it } from "vitest";
import { iaAutorisee, lireConfigSecurite } from "./config";

describe("lireConfigSecurite : valeurs de départ", () => {
  it("10 analyses/heure, 30/jour, 5 $/jour, compteur en cache 5 minutes", () => {
    const c = lireConfigSecurite({});
    expect(c).toMatchObject({
      limiteParHeure: 10,
      limiteParJour: 30,
      plafondJournalierUsd: 5,
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
    expect(lireConfigSecurite({ DAILY_SPEND_CAP_USD: "" }).plafondJournalierUsd).toBe(5);
  });

  it.each(["abc", "-1", "Infinity", "1e9"])("un plafond invalide (%j) retombe sur 5", (valeur) => {
    expect(lireConfigSecurite({ DAILY_SPEND_CAP_USD: valeur }).plafondJournalierUsd).toBe(5);
  });

  it("Upstash exige l'URL ET le jeton", () => {
    expect(lireConfigSecurite({ UPSTASH_REDIS_REST_URL: "https://x" }).upstash).toBeNull();
    expect(lireConfigSecurite({ UPSTASH_REDIS_REST_TOKEN: "t" }).upstash).toBeNull();
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
