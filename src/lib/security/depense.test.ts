import { describe, expect, it } from "vitest";
import { cleDepense, lireDepenseDuJour, regulariser, reserver } from "./depense";
import { StockageMemoire } from "./stockage";

const JOUR = new Date("2026-10-26T10:00:00Z");

describe("plafond de dépense", () => {
  it("réserve tant que le total reste sous le plafond", async () => {
    const stockage = new StockageMemoire();
    const r = await reserver(stockage, { plafondUsd: 5, estimationUsd: 0.004, maintenant: JOUR });
    expect(r.ok).toBe(true);
    expect(await lireDepenseDuJour(stockage, JOUR)).toBeCloseTo(0.004, 6);
  });

  it("refuse la réservation qui ferait dépasser le plafond, et la retire du total", async () => {
    const stockage = new StockageMemoire();
    expect(
      (await reserver(stockage, { plafondUsd: 0.01, estimationUsd: 0.006, maintenant: JOUR })).ok,
    ).toBe(true);
    const refus = await reserver(stockage, {
      plafondUsd: 0.01,
      estimationUsd: 0.006,
      maintenant: JOUR,
    });
    expect(refus.ok).toBe(false);
    expect(await lireDepenseDuJour(stockage, JOUR)).toBeCloseTo(0.006, 6);
  });

  it("des appels simultanés ne dépassent jamais le plafond", async () => {
    const stockage = new StockageMemoire();
    const resultats = await Promise.all(
      Array.from({ length: 200 }, () =>
        reserver(stockage, { plafondUsd: 0.1, estimationUsd: 0.005, maintenant: JOUR }),
      ),
    );
    const acceptees = resultats.filter((r) => r.ok).length;
    expect(acceptees).toBeLessThanOrEqual(20);
    expect(acceptees).toBeGreaterThan(0);
    expect(await lireDepenseDuJour(stockage, JOUR)).toBeLessThanOrEqual(0.1 + 1e-9);
  });

  it("un plafond à 0 coupe l'IA sans toucher au stockage", async () => {
    const stockage = new StockageMemoire();
    const r = await reserver(stockage, { plafondUsd: 0, estimationUsd: 0.004, maintenant: JOUR });
    expect(r.ok).toBe(false);
    expect(stockage.cles()).toEqual([]);
  });

  it("la régularisation remplace la réservation par le coût réel", async () => {
    const stockage = new StockageMemoire();
    const r = await reserver(stockage, { plafondUsd: 5, estimationUsd: 0.004, maintenant: JOUR });
    if (!r.ok) throw new Error("réservation refusée");
    await regulariser(stockage, r.reservation, 0.0012);
    expect(await lireDepenseDuJour(stockage, JOUR)).toBeCloseTo(0.0012, 6);
  });

  it("un appel qui n'a rien coûté rend toute la réservation", async () => {
    const stockage = new StockageMemoire();
    const r = await reserver(stockage, { plafondUsd: 5, estimationUsd: 0.004, maintenant: JOUR });
    if (!r.ok) throw new Error("réservation refusée");
    await regulariser(stockage, r.reservation, 0);
    expect(await lireDepenseDuJour(stockage, JOUR)).toBe(0);
  });

  it("un coût inconnu (null) garde la réservation : choix prudent", async () => {
    const stockage = new StockageMemoire();
    const r = await reserver(stockage, { plafondUsd: 5, estimationUsd: 0.004, maintenant: JOUR });
    if (!r.ok) throw new Error("réservation refusée");
    await regulariser(stockage, r.reservation, null);
    expect(await lireDepenseDuJour(stockage, JOUR)).toBeCloseTo(0.004, 6);
  });

  it("une régularisation rend de la place aux appels suivants", async () => {
    const stockage = new StockageMemoire();
    const options = { plafondUsd: 0.01, estimationUsd: 0.008, maintenant: JOUR };
    const premier = await reserver(stockage, options);
    if (!premier.ok) throw new Error("réservation refusée");
    expect((await reserver(stockage, options)).ok).toBe(false);
    await regulariser(stockage, premier.reservation, 0.001);
    expect((await reserver(stockage, options)).ok).toBe(true);
  });

  it("le compteur repart à zéro le lendemain (UTC) et expire seul", async () => {
    const horloge = { ms: JOUR.getTime() };
    const stockage = new StockageMemoire(() => horloge.ms);
    await reserver(stockage, { plafondUsd: 0.005, estimationUsd: 0.005, maintenant: JOUR });
    const demain = new Date("2026-10-27T00:00:01Z");
    expect(cleDepense(demain)).not.toBe(cleDepense(JOUR));
    expect(
      (await reserver(stockage, { plafondUsd: 0.005, estimationUsd: 0.005, maintenant: demain }))
        .ok,
    ).toBe(true);
    horloge.ms += 4 * 86_400_000;
    expect(stockage.cles()).toEqual([]);
  });
});
