import { afterEach, describe, expect, it, vi } from "vitest";
import { HealthResponseSchema } from "../contracts/api";
import { StockageMemoire } from "../security";
import { reserver } from "../security/depense";
import { creerContexteTest, evaluateurFactice } from "./test-utils";
import { traiterSante } from "./sante";

afterEach(() => vi.restoreAllMocks());

const PRODUCTION = { NODE_ENV: "production", VERCEL_ENV: "production" };
const UPSTASH = {
  UPSTASH_REDIS_REST_URL: "https://secret-host.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "jeton-ultra-secret",
};
const SECRETS = {
  ANTHROPIC_API_KEY: "sk-ant-cle-ultra-secrete",
  IP_HASH_SECRET: "secret-ip-ultra-secret",
  ...UPSTASH,
};

const lire = async (r: Response) => HealthResponseSchema.parse(await r.json());

describe("GET /api/v1/health", () => {
  it("tout est configuré : IA active, Upstash joignable", async () => {
    const { deps } = creerContexteTest({ env: { ...PRODUCTION, ...SECRETS } });
    const r = await traiterSante(deps);
    expect(r.status).toBe(200);
    expect(await lire(r)).toEqual({
      anthropic: "present",
      upstash: "joignable",
      ip_secret: "present",
      ia_active: true,
      modele: "claude-haiku-5-5",
      manque: [],
      raison_inactive: null,
      environnement: "production",
      plafond_usd: 1,
      depense_du_jour_usd: 0,
    });
  });

  it("ne révèle jamais une valeur secrète, ni le nom d'hôte du stockage", async () => {
    const { deps } = creerContexteTest({ env: { ...PRODUCTION, ...SECRETS } });
    const corps = await (await traiterSante(deps)).text();
    for (const secret of [
      "sk-ant-cle-ultra-secrete",
      "secret-ip-ultra-secret",
      "jeton-ultra-secret",
      "secret-host",
      "upstash.io",
    ]) {
      expect(corps, secret).not.toContain(secret);
    }
  });

  it("ne se met jamais en cache côté navigateur", async () => {
    const { deps } = creerContexteTest({ env: { ...PRODUCTION, ...SECRETS } });
    expect((await traiterSante(deps)).headers.get("cache-control")).toBe("no-store");
  });

  it("clé Anthropic absente : IA inactive, la variable est nommée", async () => {
    const { deps } = creerContexteTest({
      ia: null,
      env: { ...PRODUCTION, ...SECRETS, ANTHROPIC_API_KEY: "" },
    });
    const s = await lire(await traiterSante(deps));
    expect(s).toMatchObject({
      anthropic: "absent",
      ia_active: false,
      raison_inactive: "ia_non_configuree",
      manque: ["ANTHROPIC_API_KEY"],
    });
  });

  it("Upstash absent en production : IA inactive, les deux variables sont nommées", async () => {
    const { deps } = creerContexteTest({
      env: { ...PRODUCTION, ANTHROPIC_API_KEY: "sk-test", IP_HASH_SECRET: "s" },
    });
    const s = await lire(await traiterSante(deps));
    expect(s.upstash).toBe("absent");
    expect(s.ia_active).toBe(false);
    expect(s.raison_inactive).toBe("stockage_non_partage");
    expect(s.manque).toEqual([
      "UPSTASH_REDIS_REST_URL (ou KV_REST_API_URL)",
      "UPSTASH_REDIS_REST_TOKEN (ou KV_REST_API_TOKEN)",
    ]);
  });

  it("secret des IP absent : IA inactive, la variable est nommée", async () => {
    const { deps } = creerContexteTest({
      env: { ...PRODUCTION, ...SECRETS, IP_HASH_SECRET: "" },
    });
    const s = await lire(await traiterSante(deps));
    expect(s).toMatchObject({
      ip_secret: "absent",
      ia_active: false,
      raison_inactive: "secret_manquant",
      manque: ["IP_HASH_SECRET"],
    });
  });

  it("rien n'est configuré : toutes les variables sont listées", async () => {
    const { deps } = creerContexteTest({
      ia: null,
      env: { ...PRODUCTION, ANTHROPIC_API_KEY: "", IP_HASH_SECRET: "" },
    });
    const s = await lire(await traiterSante(deps));
    expect(s.manque).toEqual([
      "ANTHROPIC_API_KEY",
      "UPSTASH_REDIS_REST_URL (ou KV_REST_API_URL)",
      "UPSTASH_REDIS_REST_TOKEN (ou KV_REST_API_TOKEN)",
      "IP_HASH_SECRET",
    ]);
    expect(s.ia_active).toBe(false);
  });

  it("Upstash configuré mais injoignable : « present », IA inactive, rien ne plante", async () => {
    const casse = new StockageMemoire();
    vi.spyOn(casse, "lire").mockRejectedValue(new Error("redis indisponible"));
    const { deps } = creerContexteTest({ stockage: casse, env: { ...PRODUCTION, ...SECRETS } });
    const s = await lire(await traiterSante(deps));
    expect(s).toMatchObject({
      upstash: "present",
      ia_active: false,
      raison_inactive: "stockage_indisponible",
      depense_du_jour_usd: null,
    });
    expect(s.manque).toEqual([]);
  });

  it("un stockage qui ne répond pas est abandonné au bout de 3 s", async () => {
    vi.useFakeTimers();
    try {
      const lent = new StockageMemoire();
      vi.spyOn(lent, "lire").mockReturnValue(new Promise(() => {}));
      const { deps } = creerContexteTest({ stockage: lent, env: { ...PRODUCTION, ...SECRETS } });
      const promesse = traiterSante(deps);
      await vi.advanceTimersByTimeAsync(3_100);
      expect((await lire(await promesse)).upstash).toBe("present");
    } finally {
      vi.useRealTimers();
    }
  });

  it("développement sans Upstash : le repli en mémoire suffit, seule la clé compte", async () => {
    const { deps } = creerContexteTest({ env: { ANTHROPIC_API_KEY: "sk-test" } });
    const s = await lire(await traiterSante(deps));
    expect(s).toMatchObject({
      upstash: "absent",
      ia_active: true,
      manque: [],
      environnement: "development",
    });
  });

  it("plafond de dépense atteint : IA inactive, dépense du jour visible", async () => {
    const { deps, stockage, horloge } = creerContexteTest({
      env: { ...PRODUCTION, ...SECRETS, DAILY_SPEND_CAP_USD: "0.01" },
    });
    await reserver(stockage, {
      plafondUsd: 1,
      estimationUsd: 0.0123,
      maintenant: new Date(horloge.ms),
    });
    const s = await lire(await traiterSante(deps));
    expect(s.depense_du_jour_usd).toBeCloseTo(0.0123, 6);
    expect(s.ia_active).toBe(false);
    expect(s.raison_inactive).toBe("plafond_atteint");
  });

  it("plafond à 0 : IA inactive", async () => {
    const { deps } = creerContexteTest({
      env: { ...PRODUCTION, ...SECRETS, DAILY_SPEND_CAP_USD: "0" },
    });
    expect((await lire(await traiterSante(deps))).raison_inactive).toBe("plafond_atteint");
  });

  it("annonce le modèle configuré et l'environnement (preview ≠ production)", async () => {
    const { deps } = creerContexteTest({
      env: {
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
        ...SECRETS,
        ANTHROPIC_MODEL: "claude-sonnet-5-5",
      },
    });
    const s = await lire(await traiterSante(deps));
    expect(s.modele).toBe("claude-sonnet-5-5");
    expect(s.environnement).toBe("preview");
  });

  it("le résultat est gardé 30 secondes : le stockage n'est pas sollicité à chaque appel", async () => {
    const { deps, stockage, horloge } = creerContexteTest({ env: { ...PRODUCTION, ...SECRETS } });
    const lecture = vi.spyOn(stockage, "lire");
    await traiterSante(deps);
    const apres = lecture.mock.calls.length;
    for (let i = 0; i < 20; i++) await traiterSante(deps);
    expect(lecture.mock.calls.length).toBe(apres);
    horloge.ms += 31_000;
    await traiterSante(deps);
    expect(lecture.mock.calls.length).toBeGreaterThan(apres);
  });

  it("n'écrit rien dans le stockage", async () => {
    const { deps, stockage } = creerContexteTest({ env: { ...PRODUCTION, ...SECRETS } });
    await traiterSante(deps);
    expect(stockage.cles()).toEqual([]);
  });

  it("ne dépend pas de l'évaluateur factice : la présence de la clé se lit sur le client IA", async () => {
    const { deps } = creerContexteTest({
      ia: evaluateurFactice(),
      env: { ...PRODUCTION, ...SECRETS },
    });
    expect((await lire(await traiterSante(deps))).anthropic).toBe("present");
  });
});
