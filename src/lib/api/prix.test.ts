import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalyzeResponseSchema } from "../contracts/api";
import { ApiErrorSchema } from "../contracts/errors";
import { PrixResponseSchema, type EstimationPrix } from "../contracts/prix";
import { fr } from "../copy/fr";
import { cleCachePrix } from "../prix";
import { lireDepenseDuJour } from "../security";
import { traiterAnalyse } from "./analyze";
import { clePrixProduit } from "./cles";
import { traiterPrix } from "./prix";
import {
  CONVERSATION_BANALE,
  ESTIMATION_SAC,
  USAGE_RECHERCHE_TYPIQUE,
  creerContexteTest,
  estimateurFactice,
  evaluateurFactice,
  reponseSac,
  requeteAnalyse,
  requetePrix,
  type ContexteTest,
} from "./test-utils";

afterEach(() => vi.restoreAllMocks());

type OptionsSac = Parameters<typeof reponseSac>[0];

/** Analyse un « sac » : renvoie l'identifiant, le score et les signaux de l'analyse. */
async function analyserSac(
  ctx: ContexteTest,
  sac: OptionsSac = {},
  entetes: Record<string, string> = {},
) {
  ctx.ia.appels.length = 0;
  const deps = { ...ctx.deps, evaluateur: evaluateurFactice({ reponse: reponseSac(sac) }) };
  const r = await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_BANALE }, entetes), deps);
  expect(r.status).toBe(200);
  const json = AnalyzeResponseSchema.parse(await r.json());
  return {
    id: json.analyse_id,
    disponible: json.comparaison_prix.disponible,
    score: json.resultat.score,
    niveau: json.resultat.niveau,
    signaux: json.resultat.signaux.map((s) => s.id),
  };
}

async function comparer(ctx: ContexteTest, id: string, entetes: Record<string, string> = {}) {
  const r = await traiterPrix(requetePrix({ analyse_id: id }, entetes), ctx.deps);
  return { r, json: (await r.json()) as unknown };
}
async function comparerOk(ctx: ContexteTest, id: string) {
  const { r, json } = await comparer(ctx, id);
  expect(r.status).toBe(200);
  return PrixResponseSchema.parse(json);
}

const depense = (ctx: ContexteTest) => lireDepenseDuJour(ctx.stockage, new Date(ctx.horloge.ms));

describe("l'analyse propose la comparaison seulement quand elle se justifie", () => {
  it("marque ET modèle lus avec une confiance haute, et un prix : disponible", async () => {
    const ctx = creerContexteTest();
    expect((await analyserSac(ctx)).disponible).toBe(true);
  });

  it.each<[string, OptionsSac]>([
    ["marque absente", { marque: null }],
    ["modèle absent", { modele: null }],
    ["modèle lu avec une confiance moyenne", { confiance: { modele: "moyenne" } }],
    ["marque lue avec une confiance basse", { confiance: { marque: "basse" } }],
    ["prix absent", { prix: null }],
    ["prix à 0", { prix: 0 }],
    ["prix lu avec une confiance basse", { confiance: { prix_eur: "basse" } }],
  ])("%s : pas de bouton, pas d'enregistrement", async (_nom, sac) => {
    const ctx = creerContexteTest();
    const analyse = await analyserSac(ctx, sac);
    expect(analyse.disponible).toBe(false);
    expect(await ctx.stockage.lireTexte(clePrixProduit(analyse.id))).toBeNull();
  });

  it("un prix lu avec une confiance moyenne suffit", async () => {
    const ctx = creerContexteTest();
    expect((await analyserSac(ctx, { confiance: { prix_eur: "moyenne" } })).disponible).toBe(true);
  });

  it("sans clé d'API (donc sans estimateur) : pas de bouton", async () => {
    const ctx = creerContexteTest({ prix: null });
    expect((await analyserSac(ctx)).disponible).toBe(false);
  });

  it("en production sans stockage partagé, la recherche ne peut pas tourner : pas de bouton", async () => {
    const ctx = creerContexteTest({ env: { NODE_ENV: "production" } });
    const r = await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_BANALE }), ctx.deps);
    expect(AnalyzeResponseSchema.parse(await r.json()).comparaison_prix.disponible).toBe(false);
  });

  it("analyse « règles seules » (IA coupée) : pas de bouton", async () => {
    const ctx = creerContexteTest({ env: { DAILY_SPEND_CAP_USD: "0" } });
    const r = await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_BANALE }), ctx.deps);
    expect(AnalyzeResponseSchema.parse(await r.json()).comparaison_prix.disponible).toBe(false);
  });

  it("l'enregistrement ne garde que l'article, le prix et des nombres, une heure", async () => {
    const ctx = creerContexteTest();
    const { id } = await analyserSac(ctx);
    const brut = await ctx.stockage.lireTexte(clePrixProduit(id));
    const enregistre = JSON.parse(brut ?? "{}") as Record<string, unknown>;
    expect(Object.keys(enregistre).sort()).toEqual([
      "categorie",
      "contexte",
      "etat",
      "marque",
      "modele",
      "prix_eur",
    ]);
    expect(enregistre).toMatchObject({
      marque: "Louis Vuitton",
      modele: "Speedy 30",
      etat: "bon",
      prix_eur: 250,
    });
    // Rien de la conversation ni de la capture.
    expect(brut).not.toMatch(/dispo|Vinted|envoie/i);
    ctx.horloge.ms += 3_601_000;
    expect(await ctx.stockage.lireTexte(clePrixProduit(id))).toBeNull();
  });
});

describe("traiterPrix : comparaison", () => {
  it("renvoie les chiffres, le signal « importante » et le score mis à jour", async () => {
    const ctx = creerContexteTest();
    const analyse = await analyserSac(ctx, { prix: 250 });
    const r = await comparerOk(ctx, analyse.id);

    expect(r.statut).toBe("ok");
    expect(r.depuis_cache).toBe(false);
    expect(r.estimation).toEqual(ESTIMATION_SAC);
    // Fourchette 700–1 100 : habituel 900 ; 250 / 900 − 1 = −72 % ; 250 / 700 = 36 % du bas.
    expect(r.comparaison).toEqual({
      prix_annonce_eur: 250,
      occasion_habituelle_eur: 900,
      ecart_pct: -72,
      part_du_bas_pct: 36,
      fiable: true,
    });
    expect(r.signal).toMatchObject({ id: "prix.web", gravite: "importante", source: "regle" });
    expect(r.signal?.label).toBe(fr.regles.prixWeb.tresBas);
    expect(r.resultat.score).toBeGreaterThan(analyse.score);
    expect(r.resultat.signaux_retires).toEqual([]);
  });

  it("de 40 à 60 % du bas de la fourchette : « attention »", async () => {
    const ctx = creerContexteTest();
    const analyse = await analyserSac(ctx, { prix: 350 }); // 50 % de 700
    const r = await comparerOk(ctx, analyse.id);
    expect(r.signal).toMatchObject({ id: "prix.web", gravite: "attention" });
    expect(r.signal?.label).toBe(fr.regles.prixWeb.bas);
  });

  it("à 60 % pile : encore « attention » ; juste au-dessus : aucun signal", async () => {
    const ctx = creerContexteTest();
    const pile = await analyserSac(ctx, { prix: 420 }); // 60 % de 700
    expect((await comparerOk(ctx, pile.id)).signal?.gravite).toBe("attention");
    const dessus = await analyserSac(ctx, { prix: 421 });
    expect((await comparerOk(ctx, dessus.id)).signal).toBeNull();
  });

  it("à 40 % pile (280 €) : « attention » ; en dessous : « importante »", async () => {
    const ctx = creerContexteTest();
    const pile = await analyserSac(ctx, { prix: 280 });
    expect((await comparerOk(ctx, pile.id)).signal?.gravite).toBe("attention");
    const dessous = await analyserSac(ctx, { prix: 279 });
    expect((await comparerOk(ctx, dessous.id)).signal?.gravite).toBe("importante");
  });

  it("jamais « critique », même pour un prix dérisoire : le score reste sous le plancher critique", async () => {
    const ctx = creerContexteTest();
    const analyse = await analyserSac(ctx, { prix: 1 });
    const r = await comparerOk(ctx, analyse.id);
    expect(r.signal?.gravite).toBe("importante");
    expect(r.resultat.score).toBeLessThan(75);
  });

  it("un prix normal : chiffres affichés, aucun signal, score inchangé", async () => {
    const ctx = creerContexteTest();
    const analyse = await analyserSac(ctx, { prix: 900 });
    const r = await comparerOk(ctx, analyse.id);
    expect(r.comparaison).toMatchObject({ ecart_pct: 0, fiable: true });
    expect(r.signal).toBeNull();
    expect(r.resultat).toEqual({
      score: analyse.score,
      niveau: analyse.niveau,
      signaux_retires: [],
    });
  });

  it("une estimation à confiance basse s'affiche mais ne change pas le score", async () => {
    const basse: EstimationPrix = { ...ESTIMATION_SAC, confiance: "basse" };
    const ctx = creerContexteTest({ prix: estimateurFactice({ estimation: basse }) });
    const analyse = await analyserSac(ctx, { prix: 100 });
    const r = await comparerOk(ctx, analyse.id);
    expect(r.comparaison?.fiable).toBe(false);
    expect(r.signal).toBeNull();
    expect(r.resultat.score).toBe(analyse.score);
  });

  it("sans fourchette d'occasion : « introuvable », mais le prix neuf est rendu", async () => {
    const neufSeul: EstimationPrix = {
      ...ESTIMATION_SAC,
      occasion_min_eur: null,
      occasion_max_eur: null,
    };
    const ctx = creerContexteTest({ prix: estimateurFactice({ estimation: neufSeul }) });
    const analyse = await analyserSac(ctx);
    const r = await comparerOk(ctx, analyse.id);
    expect(r.statut).toBe("introuvable");
    expect(r.estimation?.prix_neuf_eur).toBe(1_800);
    expect(r.comparaison).toBeNull();
    expect(r.signal).toBeNull();
    expect(r.resultat.score).toBe(analyse.score);
  });

  it("recherche sans résultat : « introuvable », et c'est gardé en cache", async () => {
    const ctx = creerContexteTest({ prix: estimateurFactice({ estimation: null }) });
    const analyse = await analyserSac(ctx);
    const premiere = await comparerOk(ctx, analyse.id);
    expect(premiere).toMatchObject({
      statut: "introuvable",
      estimation: null,
      depuis_cache: false,
    });
    const seconde = await comparerOk(ctx, analyse.id);
    expect(seconde).toMatchObject({ statut: "introuvable", estimation: null, depuis_cache: true });
    expect(ctx.prix?.appels).toHaveLength(1);
  });

  it("l'estimateur reçoit l'article, jamais le prix de l'annonce", async () => {
    const ctx = creerContexteTest();
    const analyse = await analyserSac(ctx, { prix: 250 });
    await comparerOk(ctx, analyse.id);
    expect(ctx.prix?.appels).toEqual([
      { marque: "Louis Vuitton", modele: "Speedy 30", categorie: "sac à main", etat: "bon" },
    ]);
    expect(JSON.stringify(ctx.prix?.appels)).not.toContain("250");
  });

  it("l'identifiant n'est pas consommé : on peut relancer, le résultat est le même", async () => {
    const ctx = creerContexteTest();
    const analyse = await analyserSac(ctx, { prix: 250 });
    const a = await comparerOk(ctx, analyse.id);
    const b = await comparerOk(ctx, analyse.id);
    expect(b).toEqual({ ...a, depuis_cache: true });
  });
});

describe("traiterPrix : signal de la table de prix (marque seule)", () => {
  it("un signal « importante » de la comparaison remplace celui de la table sans doubler le prix", async () => {
    const ctx = creerContexteTest();
    // Louis Vuitton à 20 € : la table dit déjà « très bas » (moins de 20 % de 150 €).
    const analyse = await analyserSac(ctx, { prix: 20 });
    expect(analyse.signaux).toContain("prix.tres_bas");
    const r = await comparerOk(ctx, analyse.id);
    expect(r.signal).toMatchObject({ id: "prix.web", gravite: "importante" });
    expect(r.resultat.signaux_retires).toEqual(["prix.tres_bas"]);
    expect(r.resultat.score).toBe(analyse.score); // même poids : pas compté deux fois
  });

  it("une comparaison plus grave que « attention » de la table fait monter le score", async () => {
    const ctx = creerContexteTest();
    // 50 € : la table dit « bas » (attention, 20–40 % de 150 €), la comparaison « importante ».
    const analyse = await analyserSac(ctx, { prix: 50 });
    expect(analyse.signaux).toContain("prix.bas");
    const r = await comparerOk(ctx, analyse.id);
    expect(r.signal?.gravite).toBe("importante");
    expect(r.resultat.signaux_retires).toEqual(["prix.bas"]);
    expect(r.resultat.score).toBeGreaterThan(analyse.score);
  });

  it("si la table est plus sévère que la comparaison, elle reste : on ne baisse pas le risque", async () => {
    // Estimation : occasion 30–40 € ; prix 15 € = 50 % du bas → « attention », la table dit « importante ».
    const peuCher: EstimationPrix = {
      ...ESTIMATION_SAC,
      prix_neuf_eur: 60,
      occasion_min_eur: 30,
      occasion_max_eur: 40,
    };
    const ctx = creerContexteTest({ prix: estimateurFactice({ estimation: peuCher }) });
    const analyse = await analyserSac(ctx, { prix: 15 });
    expect(analyse.signaux).toContain("prix.tres_bas");
    const r = await comparerOk(ctx, analyse.id);
    expect(r.signal).toBeNull();
    expect(r.resultat).toEqual({
      score: analyse.score,
      niveau: analyse.niveau,
      signaux_retires: [],
    });
  });
});

describe("traiterPrix : cache (marque, modèle, état), 24 h", () => {
  it("la deuxième comparaison du même article ne refait pas la recherche et ne coûte rien", async () => {
    const ctx = creerContexteTest();
    const a = await analyserSac(ctx, { prix: 250 });
    await comparerOk(ctx, a.id);
    const apres = await depense(ctx);
    const b = await analyserSac(ctx, { prix: 300 }); // autre annonce, même article
    const rb = await comparerOk(ctx, b.id);
    expect(rb.depuis_cache).toBe(true);
    expect(ctx.prix?.appels).toHaveLength(1);
    // Le prix de CETTE annonce est comparé à l'estimation en cache.
    expect(rb.comparaison?.prix_annonce_eur).toBe(300);
    // Seule la nouvelle analyse a coûté (lecture IA), pas la comparaison.
    expect(await depense(ctx)).toBeLessThan(apres + 0.002);
  });

  it("un autre état est une autre estimation", async () => {
    const ctx = creerContexteTest();
    const bon = await analyserSac(ctx, { etat: "Bon état" });
    const neuf = await analyserSac(ctx, { etat: "Neuf avec étiquette" });
    await comparerOk(ctx, bon.id);
    await comparerOk(ctx, neuf.id);
    expect(ctx.prix?.appels.map((a) => a.etat)).toEqual(["bon", "neuf"]);
  });

  it("un autre modèle est une autre estimation", async () => {
    const ctx = creerContexteTest();
    await comparerOk(ctx, (await analyserSac(ctx, { modele: "Speedy 30" })).id);
    await comparerOk(ctx, (await analyserSac(ctx, { modele: "Neverfull MM" })).id);
    expect(ctx.prix?.appels).toHaveLength(2);
  });

  it("l'estimation expire au bout de 24 h", async () => {
    const ctx = creerContexteTest();
    await comparerOk(ctx, (await analyserSac(ctx)).id);
    ctx.horloge.ms += 86_399_000;
    expect((await comparerOk(ctx, (await analyserSac(ctx)).id)).depuis_cache).toBe(true);
    ctx.horloge.ms += 2_000;
    expect((await comparerOk(ctx, (await analyserSac(ctx)).id)).depuis_cache).toBe(false);
    expect(ctx.prix?.appels).toHaveLength(2);
  });

  it("la durée du cache se règle (PRICE_CACHE_TTL_S)", async () => {
    const ctx = creerContexteTest({ env: { PRICE_CACHE_TTL_S: "120" } });
    const a = await analyserSac(ctx);
    await comparerOk(ctx, a.id);
    ctx.horloge.ms += 121_000;
    const b = await analyserSac(ctx);
    expect((await comparerOk(ctx, b.id)).depuis_cache).toBe(false);
  });

  it("le cache ne contient ni le prix de l'annonce ni rien de la conversation", async () => {
    const ctx = creerContexteTest();
    const analyse = await analyserSac(ctx, { prix: 250 });
    await comparerOk(ctx, analyse.id);
    const cle = cleCachePrix({ marque: "Louis Vuitton", modele: "Speedy 30", etat: "bon" });
    const brut = (await ctx.stockage.lireTexte(cle)) ?? "";
    expect(JSON.parse(brut)).toEqual({ estimation: ESTIMATION_SAC });
    expect(brut).not.toContain("250");
  });

  it("un cache illisible n'empêche pas la comparaison : la recherche est refaite", async () => {
    const ctx = creerContexteTest();
    const cle = cleCachePrix({ marque: "Louis Vuitton", modele: "Speedy 30", etat: "bon" });
    await ctx.stockage.poser(cle, "{pas du json", 600);
    const r = await comparerOk(ctx, (await analyserSac(ctx)).id);
    expect(r.depuis_cache).toBe(false);
    expect(ctx.prix?.appels).toHaveLength(1);
  });
});

describe("traiterPrix : plafond de dépense", () => {
  it("compte le coût réel : recherches (0,01 $ pièce) + jetons", async () => {
    const ctx = creerContexteTest();
    const analyse = await analyserSac(ctx);
    const avant = await depense(ctx);
    await comparerOk(ctx, analyse.id);
    // 2 recherches + 15 000 jetons d'entrée à 0,10 $/M + 700 en sortie à 0,50 $/M.
    expect(USAGE_RECHERCHE_TYPIQUE.recherchesWeb).toBe(2);
    expect((await depense(ctx)) - avant).toBeCloseTo(0.02185, 6);
  });

  it("réserve le pire cas avant la recherche : 3 recherches + 60 000 jetons + la réponse maximale", async () => {
    const ctx = creerContexteTest({ env: { DAILY_SPEND_CAP_USD: "0.03" } });
    const analyse = await analyserSac(ctx);
    const { r, json } = await comparer(ctx, analyse.id);
    // Pire cas 0,0375 $ > plafond 0,03 $ : refusé avant d'appeler l'API.
    expect(r.status).toBe(503);
    expect(ApiErrorSchema.parse(json).erreur).toMatchObject({
      code: "plafond_atteint",
      message: fr.erreursPrecises.prixAffluence,
    });
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(ctx.prix?.appels).toHaveLength(0);
  });

  it("une comparaison déjà en cache reste servie quand le plafond est atteint", async () => {
    const ctx = creerContexteTest();
    const a = await analyserSac(ctx);
    await comparerOk(ctx, a.id);
    // Plafond atteint ensuite : on le simule en remplissant le compteur du jour.
    await ctx.stockage.incrementer(
      `depense:${new Date(ctx.horloge.ms).toISOString().slice(0, 10)}`,
      50_000_000,
    );
    expect((await comparerOk(ctx, a.id)).depuis_cache).toBe(true);
  });

  it("des comparaisons simultanées de produits différents ne dépassent pas le plafond", async () => {
    // Plafond de 0,06 $ : deux réservations de 0,0375 $ ne tiennent pas ensemble (0,075 $).
    const ctx = creerContexteTest({
      env: { DAILY_SPEND_CAP_USD: "0.06", PRICE_RATE_LIMIT_PER_HOUR: "10" },
    });
    const ids = await Promise.all(
      ["Speedy 30", "Neverfull MM", "Alma BB"].map(
        async (modele) => (await analyserSac(ctx, { modele })).id,
      ),
    );
    const reponses = await Promise.all(
      ids.map((id) => traiterPrix(requetePrix({ analyse_id: id }), ctx.deps)),
    );
    const statuts = reponses.map((r) => r.status).sort();
    expect(statuts.filter((s) => s === 200)).toHaveLength(1);
    expect(ctx.prix?.appels).toHaveLength(1);
  });

  it("recherche en échec avec un usage connu : on ne paie que ce qui a été consommé", async () => {
    const ctx = creerContexteTest({
      prix: estimateurFactice({
        echec: { raison: "reponse_invalide", usage: USAGE_RECHERCHE_TYPIQUE },
      }),
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const analyse = await analyserSac(ctx);
    const avant = await depense(ctx);
    const { r } = await comparer(ctx, analyse.id);
    expect(r.status).toBe(503);
    expect((await depense(ctx)) - avant).toBeCloseTo(0.02185, 6);
  });

  it("recherche en échec sans usage et hors délai : la réservation est rendue", async () => {
    const ctx = creerContexteTest({
      prix: estimateurFactice({ echec: { raison: "indisponible" } }),
    });
    const analyse = await analyserSac(ctx);
    const avant = await depense(ctx);
    await comparer(ctx, analyse.id);
    expect(await depense(ctx)).toBeCloseTo(avant, 6);
  });

  it("délai dépassé sans usage connu : la réservation est gardée (l'appel a pu être facturé)", async () => {
    const ctx = creerContexteTest({ prix: estimateurFactice({ echec: { raison: "delai" } }) });
    const analyse = await analyserSac(ctx);
    const avant = await depense(ctx);
    await comparer(ctx, analyse.id);
    expect((await depense(ctx)) - avant).toBeCloseTo(0.0375, 6);
  });
});

describe("traiterPrix : limites", () => {
  it("les recherches sont limitées par IP (5/h par défaut) ; le cache ne l'est pas", async () => {
    const ctx = creerContexteTest({ env: { PRICE_RATE_LIMIT_PER_HOUR: "2" } });
    const modeles = ["A1", "B2", "C3"];
    const ids = [];
    for (const modele of modeles) ids.push((await analyserSac(ctx, { modele })).id);
    expect((await comparer(ctx, ids[0] ?? "")).r.status).toBe(200);
    expect((await comparer(ctx, ids[1] ?? "")).r.status).toBe(200);
    const bloque = await comparer(ctx, ids[2] ?? "");
    expect(bloque.r.status).toBe(429);
    expect(ApiErrorSchema.parse(bloque.json).erreur.message).toBe(
      fr.erreursPrecises.prixTropDeRecherches,
    );
    expect(Number(bloque.r.headers.get("retry-after"))).toBeGreaterThan(0);
    // Un article déjà en cache passe quand même.
    expect((await comparerOk(ctx, ids[0] ?? "")).depuis_cache).toBe(true);
    // Et une autre IP n'est pas concernée.
    const autre = await comparer(ctx, ids[2] ?? "", { "x-forwarded-for": "203.0.113.9" });
    expect(autre.r.status).toBe(200);
  });

  it("les limites se règlent par variables d'environnement", async () => {
    const ctx = creerContexteTest({ env: { PRICE_RATE_LIMIT_PER_HOUR: "1" } });
    const a = await analyserSac(ctx, { modele: "A1" });
    const b = await analyserSac(ctx, { modele: "B2" });
    expect((await comparer(ctx, a.id)).r.status).toBe(200);
    expect((await comparer(ctx, b.id)).r.status).toBe(429);
  });

  it("une requête d'un autre site est refusée", async () => {
    const ctx = creerContexteTest();
    const analyse = await analyserSac(ctx);
    const r = await traiterPrix(
      requetePrix({ analyse_id: analyse.id }, { "sec-fetch-site": "cross-site" }),
      ctx.deps,
    );
    expect(r.status).toBe(403);
    expect(ctx.prix?.appels).toHaveLength(0);
  });
});

describe("traiterPrix : entrées invalides et cas refusés", () => {
  it("identifiant inconnu ou expiré : comparaison_impossible (409), sans recherche ni dépense", async () => {
    const ctx = creerContexteTest();
    const { r, json } = await comparer(ctx, "6f1f3a52-3c1b-4a56-9d5e-0b2c7d9f1a10");
    expect(r.status).toBe(409);
    expect(ApiErrorSchema.parse(json).erreur).toMatchObject({
      code: "comparaison_impossible",
      message: fr.erreurs.comparaison_impossible,
    });
    expect(ctx.prix?.appels).toHaveLength(0);
    expect(await depense(ctx)).toBe(0);
  });

  it("identifiant expiré après une heure", async () => {
    const ctx = creerContexteTest();
    const analyse = await analyserSac(ctx);
    ctx.horloge.ms += 3_601_000;
    expect((await comparer(ctx, analyse.id)).r.status).toBe(409);
  });

  it("enregistrement altéré : même réponse qu'un identifiant inconnu", async () => {
    const ctx = creerContexteTest();
    const analyse = await analyserSac(ctx);
    await ctx.stockage.poser(clePrixProduit(analyse.id), '{"marque":"x"}', 600);
    expect((await comparer(ctx, analyse.id)).r.status).toBe(409);
    expect(ctx.prix?.appels).toHaveLength(0);
  });

  it.each([
    ["corps vide", ""],
    ["JSON invalide", "{pas du json"],
    ["identifiant manquant", "{}"],
    ["identifiant qui n'est pas un UUID", '{"analyse_id":"abc"}'],
    ["identifiant d'un autre type", '{"analyse_id":12}'],
    ["tableau", "[]"],
  ])("%s : entree_invalide (400)", async (_nom, corps) => {
    const ctx = creerContexteTest();
    const r = await traiterPrix(requetePrix(corps), ctx.deps);
    expect(r.status).toBe(400);
    expect(ApiErrorSchema.parse(await r.json()).erreur.code).toBe("entree_invalide");
  });

  it("corps trop gros : 413", async () => {
    const ctx = creerContexteTest();
    const r = await traiterPrix(
      requetePrix(JSON.stringify({ analyse_id: "x".repeat(5_000) })),
      ctx.deps,
    );
    expect(r.status).toBe(413);
  });

  it("le client ne peut ni fournir le prix ni l'article : seuls l'identifiant compte", async () => {
    const ctx = creerContexteTest();
    const analyse = await analyserSac(ctx, { prix: 900 });
    const r = await traiterPrix(
      requetePrix({ analyse_id: analyse.id, prix: 10, marque: "Gucci", modele: "X" }),
      ctx.deps,
    );
    expect(r.status).toBe(200);
    expect(ctx.prix?.appels[0]).toMatchObject({ marque: "Louis Vuitton", modele: "Speedy 30" });
    expect(PrixResponseSchema.parse(await r.json()).comparaison?.prix_annonce_eur).toBe(900);
  });
});

describe("traiterPrix : indisponibilité", () => {
  it("sans estimateur (pas de clé d'API) : ia_indisponible", async () => {
    const ctx = creerContexteTest({ prix: null });
    const { r, json } = await comparer(ctx, "6f1f3a52-3c1b-4a56-9d5e-0b2c7d9f1a10");
    expect(r.status).toBe(503);
    expect(ApiErrorSchema.parse(json).erreur.message).toBe(fr.erreursPrecises.prixIndisponible);
  });

  it("en production sans stockage partagé : aucune recherche (ni plafond, ni limite fiables)", async () => {
    const ctx = creerContexteTest({ env: { NODE_ENV: "production" } });
    const { r } = await comparer(ctx, "6f1f3a52-3c1b-4a56-9d5e-0b2c7d9f1a10");
    expect(r.status).toBe(503);
    expect(ctx.prix?.appels).toHaveLength(0);
  });

  it("stockage en panne au moment de réserver : aucune recherche sans plafond", async () => {
    const ctx = creerContexteTest();
    const analyse = await analyserSac(ctx);
    vi.spyOn(ctx.stockage, "incrementer").mockRejectedValue(new Error("panne"));
    const { r, json } = await comparer(ctx, analyse.id);
    expect(r.status).toBe(503);
    expect(ApiErrorSchema.parse(json).erreur.code).toBe("ia_indisponible");
    expect(ctx.prix?.appels).toHaveLength(0);
  });

  it("recherche en échec : ia_indisponible, rien en cache, Retry-After", async () => {
    const ctx = creerContexteTest({
      prix: estimateurFactice({ echec: { raison: "indisponible" } }),
    });
    const analyse = await analyserSac(ctx);
    const { r, json } = await comparer(ctx, analyse.id);
    expect(r.status).toBe(503);
    expect(ApiErrorSchema.parse(json).erreur).toMatchObject({
      code: "ia_indisponible",
      message: fr.erreursPrecises.prixIndisponible,
    });
    expect(r.headers.get("retry-after")).toBe("60");
    // Une nouvelle tentative relance bien la recherche (un échec n'est pas mis en cache).
    await comparer(ctx, analyse.id);
    expect(ctx.prix?.appels).toHaveLength(2);
  });

  it("un échec de configuration est journalisé, sans l'article ni le prix", async () => {
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    const ctx = creerContexteTest({
      prix: estimateurFactice({ echec: { raison: "configuration" } }),
    });
    const analyse = await analyserSac(ctx, { prix: 250 });
    await comparer(ctx, analyse.id);
    expect(erreur).toHaveBeenCalledTimes(1);
    const message = String(erreur.mock.calls[0]?.[0]);
    expect(message).toMatch(/recherche de prix en échec : configuration/);
    expect(message).not.toMatch(/Louis Vuitton|Speedy|250/);
  });

  it("un échec passager (indisponible, délai) n'est pas journalisé", async () => {
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    const ctx = creerContexteTest({
      prix: estimateurFactice({ echec: { raison: "indisponible" } }),
    });
    await comparer(ctx, (await analyserSac(ctx)).id);
    expect(erreur).not.toHaveBeenCalled();
  });

  it("une erreur d'écriture du cache ne fait pas perdre la comparaison", async () => {
    const ctx = creerContexteTest();
    const analyse = await analyserSac(ctx);
    const poser = ctx.stockage.poser.bind(ctx.stockage);
    vi.spyOn(ctx.stockage, "poser").mockImplementation(async (cle, valeur, ttl) => {
      if (cle.startsWith("prix:")) throw new Error("panne");
      return poser(cle, valeur, ttl);
    });
    expect((await comparerOk(ctx, analyse.id)).statut).toBe("ok");
  });
});

describe("traiterPrix : réponse", () => {
  it("ne met jamais la réponse en cache", async () => {
    const ctx = creerContexteTest();
    const { r } = await comparer(ctx, (await analyserSac(ctx)).id);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("ne renvoie rien de l'analyse (ni conversation ni données extraites)", async () => {
    const ctx = creerContexteTest();
    const { json } = await comparer(ctx, (await analyserSac(ctx)).id);
    expect(Object.keys(json as object).sort()).toEqual([
      "comparaison",
      "depuis_cache",
      "estimation",
      "resultat",
      "signal",
      "statut",
    ]);
  });
});
