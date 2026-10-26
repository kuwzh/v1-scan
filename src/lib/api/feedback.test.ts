import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiErrorSchema } from "../contracts/errors";
import { StockageMemoire } from "../security";
import { traiterAnalyse } from "./analyze";
import { DUREE_ID_ANALYSE_S, cleAnalyse, cleFeedback } from "./cles";
import { lireAgregatsFeedback, traiterFeedback } from "./feedback";
import {
  CONVERSATION_BANALE,
  creerContexteTest,
  requeteAnalyse,
  requeteFeedback,
} from "./test-utils";

afterEach(() => vi.restoreAllMocks());

const ID = "6f1f3a52-3c1b-4a56-9d5e-0b2c7d9f1a10";

/** Enregistre une analyse « comme le fait l'analyse » : seule la tranche de score est retenue. */
const enregistrer = (stockage: StockageMemoire, tranche: number, id = ID) =>
  stockage.poser(cleAnalyse(id), String(tranche), DUREE_ID_ANALYSE_S);

describe("traiterFeedback", () => {
  it("enregistre un vote dans l'agrégat (niveau, tranche, vote)", async () => {
    const { deps, stockage } = creerContexteTest();
    await enregistrer(stockage, 70);
    const r = await traiterFeedback(requeteFeedback({ analyse_id: ID, vote: "up" }), deps);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(await stockage.lire(cleFeedback("élevé", 70, "up"))).toBe(1);
    expect(await stockage.lire(cleFeedback("élevé", 70, "down"))).toBeNull();
  });

  it("un vote par analyse : le second est refusé", async () => {
    const { deps, stockage } = creerContexteTest();
    await enregistrer(stockage, 40);
    const vote = (v: "up" | "down") =>
      traiterFeedback(requeteFeedback({ analyse_id: ID, vote: v }), deps);
    expect((await vote("up")).status).toBe(200);
    const second = await vote("down");
    expect(second.status).toBe(409);
    expect(ApiErrorSchema.parse(await second.json()).erreur.code).toBe("vote_impossible");
    expect(await stockage.lire(cleFeedback("moyen", 40, "up"))).toBe(1);
    expect(await stockage.lire(cleFeedback("moyen", 40, "down"))).toBeNull();
  });

  it("des votes simultanés sur la même analyse : un seul est compté", async () => {
    const { deps, stockage } = creerContexteTest({ env: { RATE_LIMIT_PER_HOUR: "1000" } });
    await enregistrer(stockage, 10);
    const reponses = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        traiterFeedback(
          requeteFeedback(
            { analyse_id: ID, vote: i % 2 ? "up" : "down" },
            { "x-forwarded-for": `198.51.100.${i + 1}` },
          ),
          deps,
        ),
      ),
    );
    expect(reponses.filter((r) => r.status === 200)).toHaveLength(1);
    const total =
      ((await stockage.lire(cleFeedback("faible", 10, "up"))) ?? 0) +
      ((await stockage.lire(cleFeedback("faible", 10, "down"))) ?? 0);
    expect(total).toBe(1);
  });

  it("un identifiant inconnu et un identifiant déjà utilisé se ressemblent (pas d'oracle)", async () => {
    const { deps, stockage } = creerContexteTest();
    await enregistrer(stockage, 40);
    await traiterFeedback(requeteFeedback({ analyse_id: ID, vote: "up" }), deps);
    const utilise = await traiterFeedback(requeteFeedback({ analyse_id: ID, vote: "up" }), deps);
    const inconnu = await traiterFeedback(
      requeteFeedback({ analyse_id: "11111111-2222-4333-8444-555555555555", vote: "up" }),
      deps,
    );
    expect(await utilise.text()).toBe(await inconnu.text());
    expect(utilise.status).toBe(inconnu.status);
  });

  it("l'identifiant expire au bout d'une heure", async () => {
    const { deps, stockage, horloge } = creerContexteTest();
    await enregistrer(stockage, 40);
    horloge.ms += (DUREE_ID_ANALYSE_S + 1) * 1000;
    const r = await traiterFeedback(requeteFeedback({ analyse_id: ID, vote: "up" }), deps);
    expect(r.status).toBe(409);
  });

  it("le client ne peut pas imposer le score : seul celui retenu par le serveur compte", async () => {
    const { deps, stockage } = creerContexteTest();
    await enregistrer(stockage, 20);
    const r = await traiterFeedback(
      requeteFeedback({ analyse_id: ID, vote: "up", score: 99, niveau: "élevé", tranche: 90 }),
      deps,
    );
    expect(r.status).toBe(200);
    expect(await stockage.lire(cleFeedback("faible", 20, "up"))).toBe(1);
    expect(await stockage.lire(cleFeedback("élevé", 90, "up"))).toBeNull();
  });

  it.each([
    ["JSON illisible", "{pas du json"],
    ["identifiant qui n'est pas un UUID", { analyse_id: "abc", vote: "up" }],
    ["vote inconnu", { analyse_id: ID, vote: "peut-être" }],
    ["sans identifiant", { vote: "up" }],
    ["ancien format (score seul)", { score: 50, vote: "up" }],
  ])("refuse : %s", async (_nom, corps) => {
    const { deps } = creerContexteTest();
    const r = await traiterFeedback(requeteFeedback(corps), deps);
    expect(r.status).toBe(400);
    expect(ApiErrorSchema.parse(await r.json()).erreur.code).toBe("entree_invalide");
  });

  it("refuse un corps démesuré", async () => {
    const { deps } = creerContexteTest();
    const r = await traiterFeedback(requeteFeedback("x".repeat(5_000)), deps);
    expect(r.status).toBe(413);
  });

  it("une valeur corrompue dans le stockage n'est jamais comptée", async () => {
    const { deps, stockage } = creerContexteTest();
    await stockage.poser(cleAnalyse(ID), "n'importe quoi", 60);
    const r = await traiterFeedback(requeteFeedback({ analyse_id: ID, vote: "up" }), deps);
    expect(r.status).toBe(409);
    expect(stockage.cles().filter((c) => c.startsWith("feedback:"))).toEqual([]);
  });

  it("refuse une requête venue d'un autre site", async () => {
    const { deps, stockage } = creerContexteTest();
    await enregistrer(stockage, 40);
    const r = await traiterFeedback(
      requeteFeedback({ analyse_id: ID, vote: "up" }, { "sec-fetch-site": "cross-site" }),
      deps,
    );
    expect(r.status).toBe(403);
    expect(await stockage.prendre(cleAnalyse(ID))).toBe("40");
  });

  it("limite le débit (marteler des identifiants au hasard)", async () => {
    const { deps } = creerContexteTest();
    const statuts: number[] = [];
    for (let i = 0; i < 35; i++) {
      const id = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
      statuts.push(
        (await traiterFeedback(requeteFeedback({ analyse_id: id, vote: "up" }), deps)).status,
      );
    }
    expect(statuts.slice(0, 30).every((s) => s === 409)).toBe(true);
    expect(statuts.slice(30).every((s) => s === 429)).toBe(true);
  });

  it("le quota du feedback ne consomme pas celui des analyses", async () => {
    const { deps } = creerContexteTest({ env: { RATE_LIMIT_PER_HOUR: "1" } });
    for (let i = 0; i < 5; i++) {
      await traiterFeedback(requeteFeedback({ analyse_id: ID, vote: "up" }), deps);
    }
    const r = await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_BANALE }), deps);
    expect(r.status).toBe(200);
  });

  it("stockage en panne : erreur interne propre, rien de compté", async () => {
    const casse = new StockageMemoire();
    vi.spyOn(casse, "prendre").mockRejectedValue(new Error("redis indisponible"));
    const { deps } = creerContexteTest({ stockage: casse });
    const r = await traiterFeedback(requeteFeedback({ analyse_id: ID, vote: "up" }), deps);
    expect(r.status).toBe(500);
    expect(ApiErrorSchema.parse(await r.json()).erreur.code).toBe("erreur_interne");
  });
});

describe("feedback : de bout en bout avec une vraie analyse", () => {
  it("l'identifiant renvoyé par l'analyse permet exactement un vote", async () => {
    const { deps, stockage } = creerContexteTest();
    const analyse = (await (
      await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_BANALE }), deps)
    ).json()) as { analyse_id: string; resultat: { score: number; niveau: string } };

    const premier = await traiterFeedback(
      requeteFeedback({ analyse_id: analyse.analyse_id, vote: "down" }),
      deps,
    );
    const second = await traiterFeedback(
      requeteFeedback({ analyse_id: analyse.analyse_id, vote: "down" }),
      deps,
    );
    expect([premier.status, second.status]).toEqual([200, 409]);

    const tranche = Math.floor(analyse.resultat.score / 10) * 10;
    const cle = cleFeedback(analyse.resultat.niveau as "faible", tranche, "down");
    expect(await stockage.lire(cle)).toBe(1);
  });

  it("n'enregistre que des compteurs : aucun contenu dans les clés d'agrégat", async () => {
    const { deps, stockage } = creerContexteTest();
    const analyse = (await (
      await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_BANALE }), deps)
    ).json()) as { analyse_id: string };
    await traiterFeedback(requeteFeedback({ analyse_id: analyse.analyse_id, vote: "up" }), deps);
    const cles = stockage.cles().filter((c) => c.startsWith("feedback:"));
    expect(cles).toHaveLength(1);
    expect(cles[0]).toMatch(/^feedback:(faible|moyen|élevé):\d{1,2}:(up|down)$/);
  });
});

describe("lireAgregatsFeedback", () => {
  it("relit les agrégats par tranche, avec le niveau correspondant", async () => {
    const stockage = new StockageMemoire();
    await stockage.incrementer(cleFeedback("faible", 0, "up"), 3);
    await stockage.incrementer(cleFeedback("moyen", 30, "down"), 2);
    await stockage.incrementer(cleFeedback("élevé", 90, "up"), 5);
    const agregats = await lireAgregatsFeedback(stockage);
    expect(agregats).toHaveLength(10);
    expect(agregats[0]).toEqual({ niveau: "faible", tranche: 0, up: 3, down: 0 });
    expect(agregats[3]).toEqual({ niveau: "moyen", tranche: 30, up: 0, down: 2 });
    expect(agregats[9]).toEqual({ niveau: "élevé", tranche: 90, up: 5, down: 0 });
  });
});
