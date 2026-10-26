import type { Redis } from "@upstash/redis";
import { describe, expect, it } from "vitest";
import { StockageMemoire } from "./stockage";
import { creerStockageUpstash } from "./upstash";

function memoire() {
  const horloge = { ms: 1_000_000 };
  return { horloge, stockage: new StockageMemoire(() => horloge.ms) };
}

describe("StockageMemoire", () => {
  it("incrémente de façon cumulative, y compris vers le bas", async () => {
    const { stockage } = memoire();
    expect(await stockage.incrementer("a", 1)).toBe(1);
    expect(await stockage.incrementer("a", 5)).toBe(6);
    expect(await stockage.incrementer("a", -2)).toBe(4);
    expect(await stockage.lire("a")).toBe(4);
    expect(await stockage.lire("absente")).toBeNull();
  });

  it("les clés expirent après leur durée de vie", async () => {
    const { stockage, horloge } = memoire();
    await stockage.incrementer("a", 1, 60);
    await stockage.poser("b", "x", 60);
    horloge.ms += 59_000;
    expect(await stockage.lire("a")).toBe(1);
    horloge.ms += 2_000;
    expect(await stockage.lire("a")).toBeNull();
    expect(await stockage.prendre("b")).toBeNull();
    expect(stockage.cles()).toEqual([]);
  });

  it("une décrémentation sans durée de vie ne retire pas celle de la clé", async () => {
    const { stockage, horloge } = memoire();
    await stockage.incrementer("a", 2, 60);
    await stockage.incrementer("a", -1);
    horloge.ms += 61_000;
    expect(await stockage.lire("a")).toBeNull();
  });

  it("prendre lit ET supprime : la seconde lecture ne reçoit rien", async () => {
    const { stockage } = memoire();
    await stockage.poser("id", "40", 60);
    expect(await stockage.prendre("id")).toBe("40");
    expect(await stockage.prendre("id")).toBeNull();
  });

  it("des prises simultanées : une seule reçoit la valeur", async () => {
    const { stockage } = memoire();
    await stockage.poser("id", "40", 60);
    const prises = await Promise.all(Array.from({ length: 25 }, () => stockage.prendre("id")));
    expect(prises.filter((p) => p !== null)).toHaveLength(1);
  });
});

describe("creerStockageUpstash", () => {
  function faux() {
    const appels: Array<[string, ...unknown[]]> = [];
    const redis = {
      incrby: async (...a: unknown[]) => (appels.push(["incrby", ...a]), 7),
      multi: () => {
        const file: Array<[string, ...unknown[]]> = [];
        const pipeline = {
          incrby: (...a: unknown[]) => (file.push(["incrby", ...a]), pipeline),
          expire: (...a: unknown[]) => (file.push(["expire", ...a]), pipeline),
          exec: async () => (appels.push(["multi", ...file]), [3, 1]),
        };
        return pipeline;
      },
      get: async (...a: unknown[]) => (appels.push(["get", ...a]), "12"),
      set: async (...a: unknown[]) => (appels.push(["set", ...a]), "OK"),
      getdel: async (...a: unknown[]) => (appels.push(["getdel", ...a]), 40),
    };
    return { appels, stockage: creerStockageUpstash(redis as unknown as Redis) };
  }

  it("sans durée de vie : un simple INCRBY", async () => {
    const { appels, stockage } = faux();
    expect(await stockage.incrementer("k", -1)).toBe(7);
    expect(appels).toEqual([["incrby", "k", -1]]);
  });

  it("avec durée de vie : INCRBY et EXPIRE dans la même transaction", async () => {
    const { appels, stockage } = faux();
    expect(await stockage.incrementer("k", 1, 120)).toBe(3);
    expect(appels).toEqual([["multi", ["incrby", "k", 1], ["expire", "k", 120]]]);
  });

  it("lit les nombres, écrit avec une durée de vie, et prend avec GETDEL", async () => {
    const { appels, stockage } = faux();
    expect(await stockage.lire("k")).toBe(12);
    await stockage.poser("id", "40", 3600);
    expect(await stockage.prendre("id")).toBe("40");
    expect(appels).toEqual([
      ["get", "k"],
      ["set", "id", "40", { ex: 3600 }],
      ["getdel", "id"],
    ]);
  });
});
