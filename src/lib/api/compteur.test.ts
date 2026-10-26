import { describe, expect, it, vi } from "vitest";
import { StatsResponseSchema } from "../contracts/api";
import { StockageMemoire } from "../security";
import { CLE_COMPTEUR } from "./cles";
import { compterAnalyse, creerLecteurCompteur, traiterStats } from "./compteur";

function contexte(ttlMs = 300_000) {
  const horloge = { ms: 1_000_000 };
  const stockage = new StockageMemoire(() => horloge.ms);
  const lire = vi.spyOn(stockage, "lire");
  const lecteur = creerLecteurCompteur(stockage, ttlMs, () => horloge.ms);
  return { horloge, stockage, lire, lecteur };
}

describe("creerLecteurCompteur : mis en cache, pas recalculé à chaque visite", () => {
  it("ne relit le stockage qu'une fois par durée de cache", async () => {
    const { lecteur, lire, stockage, horloge } = contexte();
    await stockage.incrementer(CLE_COMPTEUR, 120);
    lire.mockClear();
    for (let i = 0; i < 100; i++) expect(await lecteur()).toBe(120);
    expect(lire).toHaveBeenCalledTimes(1);

    await stockage.incrementer(CLE_COMPTEUR, 5);
    horloge.ms += 299_000;
    expect(await lecteur()).toBe(120);
    horloge.ms += 2_000;
    expect(await lecteur()).toBe(125);
    expect(lire).toHaveBeenCalledTimes(2);
  });

  it("des visites simultanées partagent une seule lecture", async () => {
    const { lecteur, lire, stockage } = contexte();
    await stockage.incrementer(CLE_COMPTEUR, 7);
    lire.mockClear();
    const valeurs = await Promise.all(Array.from({ length: 50 }, () => lecteur()));
    expect(new Set(valeurs)).toEqual(new Set([7]));
    expect(lire).toHaveBeenCalledTimes(1);
  });

  it("zéro analyse : 0 (pas null)", async () => {
    expect(await contexte().lecteur()).toBe(0);
  });

  it("stockage injoignable : null au départ, jamais un nombre inventé", async () => {
    const { lecteur, lire } = contexte();
    lire.mockRejectedValue(new Error("redis indisponible"));
    expect(await lecteur()).toBeNull();
  });

  it("stockage injoignable ensuite : on garde la dernière valeur connue", async () => {
    const { lecteur, lire, stockage, horloge } = contexte();
    await stockage.incrementer(CLE_COMPTEUR, 42);
    expect(await lecteur()).toBe(42);
    lire.mockRejectedValue(new Error("redis indisponible"));
    horloge.ms += 400_000;
    expect(await lecteur()).toBe(42);
  });
});

describe("compterAnalyse", () => {
  it("incrémente d'un", async () => {
    const stockage = new StockageMemoire();
    await compterAnalyse(stockage);
    await compterAnalyse(stockage);
    expect(await stockage.lire(CLE_COMPTEUR)).toBe(2);
  });

  it("n'échoue jamais, même si le stockage est en panne", async () => {
    const stockage = new StockageMemoire();
    vi.spyOn(stockage, "incrementer").mockRejectedValue(new Error("redis indisponible"));
    await expect(compterAnalyse(stockage)).resolves.toBeUndefined();
  });
});

describe("traiterStats", () => {
  it("renvoie le compteur avec un cache CDN de la même durée", async () => {
    const r = await traiterStats(async () => 1234, 300);
    expect(StatsResponseSchema.parse(await r.json())).toEqual({ analyses: 1234 });
    expect(r.headers.get("cache-control")).toBe("public, s-maxage=300, stale-while-revalidate=600");
  });

  it("compteur indisponible : null, et un cache très court pour réessayer vite", async () => {
    const r = await traiterStats(async () => null, 300);
    expect(StatsResponseSchema.parse(await r.json())).toEqual({ analyses: null });
    expect(r.headers.get("cache-control")).toBe("public, s-maxage=30");
  });

  it("n'expose rien d'autre que le nombre", async () => {
    const r = await traiterStats(async () => 5, 300);
    expect(Object.keys(await r.json())).toEqual(["analyses"]);
  });
});
