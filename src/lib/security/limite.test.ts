import { describe, expect, it } from "vitest";
import { verifierDebit } from "./limite";
import { StockageMemoire } from "./stockage";

const LIMITES = { parHeure: 10, parJour: 30 };
// Milieu d'une heure et d'un jour UTC, pour que les fenêtres précédentes ne comptent presque pas.
const DEBUT_JOUR = Date.UTC(2026, 9, 26, 0, 0, 0);
const heure = (h: number, minutes = 30) => DEBUT_JOUR + (h * 60 + minutes) * 60_000;

function contexte() {
  const horloge = { ms: heure(12) };
  const stockage = new StockageMemoire(() => horloge.ms);
  const essayer = (cle = "ip-a", prefixe?: string) =>
    verifierDebit(stockage, cle, LIMITES, horloge.ms, prefixe);
  return { horloge, stockage, essayer };
}

describe("verifierDebit : 10 par heure, 30 par jour", () => {
  it("laisse passer 10 analyses dans l'heure, refuse la 11e", async () => {
    const { essayer } = contexte();
    for (let i = 0; i < 10; i++) expect(await essayer()).toEqual({ ok: true });
    const refus = await essayer();
    expect(refus).toMatchObject({ ok: false, portee: "heure" });
  });

  it("indique quand réessayer (fin de la fenêtre), en secondes entières ≥ 1", async () => {
    const { essayer } = contexte();
    for (let i = 0; i < 10; i++) await essayer();
    const refus = await essayer();
    expect(refus.ok).toBe(false);
    if (refus.ok) return;
    expect(refus.reessayerDansS).toBe(30 * 60);
    expect(Number.isInteger(refus.reessayerDansS)).toBe(true);
  });

  it("les visiteurs sont indépendants", async () => {
    const { essayer } = contexte();
    for (let i = 0; i < 10; i++) await essayer("ip-a");
    expect((await essayer("ip-a")).ok).toBe(false);
    expect((await essayer("ip-b")).ok).toBe(true);
  });

  it("une demande refusée n'est pas comptée : le quota revient dès que les anciennes sortent", async () => {
    const { essayer, horloge } = contexte();
    for (let i = 0; i < 10; i++) await essayer();
    for (let i = 0; i < 50; i++) expect((await essayer()).ok).toBe(false);
    // Une heure plus tard, la fenêtre précédente ne pèse presque plus.
    horloge.ms += 3_600_000 + 45 * 60_000;
    expect((await essayer()).ok).toBe(true);
  });

  it("fenêtre glissante : pas de double quota à la frontière de deux heures", async () => {
    const { essayer, horloge } = contexte();
    horloge.ms = heure(12, 59);
    for (let i = 0; i < 10; i++) expect((await essayer()).ok).toBe(true);
    horloge.ms = heure(13, 0);
    // Avec des fenêtres fixes, les 10 suivantes passeraient d'un coup.
    const suivants = await Promise.all(Array.from({ length: 10 }, () => essayer()));
    expect(suivants.filter((r) => r.ok).length).toBeLessThanOrEqual(1);
  });

  it("le quota quotidien s'applique même si le quota horaire est respecté", async () => {
    const { essayer, horloge } = contexte();
    let acceptees = 0;
    for (let h = 0; h < 24 && acceptees < 40; h++) {
      horloge.ms = heure(h, 5);
      for (let i = 0; i < 10; i++) if ((await essayer()).ok) acceptees++;
    }
    expect(acceptees).toBeLessThanOrEqual(31);
    expect(acceptees).toBeGreaterThanOrEqual(30);
    horloge.ms = heure(23, 40);
    const refus = await essayer();
    expect(refus).toMatchObject({ ok: false, portee: "jour" });
  });

  it("un refus pour le jour ne consomme pas non plus le quota de l'heure", async () => {
    const { essayer, stockage, horloge } = contexte();
    for (let h = 0; h < 4; h++) {
      horloge.ms = heure(h, 5);
      for (let i = 0; i < 10; i++) await essayer();
    }
    const avant = [...stockage.cles()].sort();
    await essayer();
    expect([...stockage.cles()].sort()).toEqual(avant);
  });

  it("des demandes simultanées ne dépassent pas la limite", async () => {
    const { essayer } = contexte();
    const resultats = await Promise.all(Array.from({ length: 40 }, () => essayer()));
    expect(resultats.filter((r) => r.ok)).toHaveLength(10);
  });

  it("les usages (analyse, feedback) ont chacun leurs compteurs", async () => {
    const { essayer } = contexte();
    for (let i = 0; i < 10; i++) await essayer("ip-a", "analyse");
    expect((await essayer("ip-a", "analyse")).ok).toBe(false);
    expect((await essayer("ip-a", "feedback")).ok).toBe(true);
  });

  it("les compteurs expirent d'eux-mêmes (aucune IP conservée au-delà de 2 jours)", async () => {
    const { essayer, stockage, horloge } = contexte();
    await essayer();
    expect(stockage.cles().length).toBeGreaterThan(0);
    horloge.ms += 2 * 86_400_000 + 1_000;
    expect(stockage.cles()).toEqual([]);
  });
});
