import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_IMAGE_BYTES, MAX_IMAGES, MAX_TEXT_CHARS } from "../contracts/limits";
import { AnalyzeResponseSchema } from "../contracts/api";
import { ApiErrorSchema } from "../contracts/errors";
import { reponseModele } from "../ai/test-utils";
import { fr } from "../copy/fr";
import { StockageMemoire, lireDepenseDuJour } from "../security";
import { traiterAnalyse } from "./analyze";
import { CLE_COMPTEUR } from "./cles";
import {
  CONVERSATION_BANALE,
  CONVERSATION_SUSPECTE,
  creerContexteTest,
  evaluateurFactice,
  imagePng,
  requeteAnalyse,
} from "./test-utils";

afterEach(() => vi.restoreAllMocks());

interface CorpsAnalyse {
  analyse_id: string;
  resultat: { score: number; niveau: string; meta: { mode: string } };
}
async function corps<T = CorpsAnalyse>(r: Response): Promise<T> {
  return (await r.json()) as T;
}

describe("traiterAnalyse : cas nominal", () => {
  it("analyse un texte collé et renvoie un résultat valide avec un identifiant d'analyse", async () => {
    const { deps, ia } = creerContexteTest();
    const r = await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_BANALE }), deps);
    expect(r.status).toBe(200);
    const json = AnalyzeResponseSchema.parse(await r.json());
    expect(json.resultat.meta.mode).toBe("complet");
    expect(json.partielle).toBeNull();
    expect(ia.appels).toHaveLength(1);
  });

  it("analyse une capture (l'IA reçoit l'image, avec son vrai type)", async () => {
    const { deps, ia } = creerContexteTest();
    const r = await traiterAnalyse(requeteAnalyse({ images: [imagePng(), imagePng()] }), deps);
    expect(r.status).toBe(200);
    expect(ia.appels[0]?.images.map((i) => i.mediaType)).toEqual(["image/png", "image/png"]);
  });

  it("ne met jamais la réponse en cache", async () => {
    const { deps } = creerContexteTest();
    const r = await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_BANALE }), deps);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("incrémente le compteur public, une fois par analyse réussie", async () => {
    const { deps, stockage } = creerContexteTest();
    await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_BANALE }), deps);
    await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_BANALE }), deps);
    expect(await stockage.lire(CLE_COMPTEUR)).toBe(2);
  });

  it("ne compte pas les demandes refusées ni les analyses impossibles", async () => {
    const { deps, stockage } = creerContexteTest();
    await traiterAnalyse(requeteAnalyse({}), deps);
    await traiterAnalyse(
      requeteAnalyse({ images: [new File([new Uint8Array([1, 2, 3])], "x.png")] }),
      deps,
    );
    expect(await stockage.lire(CLE_COMPTEUR)).toBeNull();
  });

  it("chaque analyse reçoit un identifiant différent, enregistré avec la seule tranche de score", async () => {
    const { deps, stockage } = creerContexteTest();
    const a = await corps(
      await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_BANALE }), deps),
    );
    const b = await corps(
      await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_BANALE }), deps),
    );
    expect(a.analyse_id).not.toBe(b.analyse_id);
    const enregistre = await stockage.prendre(`analyse:${a.analyse_id}`);
    expect(enregistre).toBe(String(Math.floor(a.resultat.score / 10) * 10));
  });

  it("un lien seul, suspect, est analysé sans aucun appel à l'IA ni réservation", async () => {
    const { deps, ia, stockage, horloge } = creerContexteTest();
    const r = await traiterAnalyse(
      requeteAnalyse({ lien: "https://vinted.fr.paiement-securise.com/colis" }),
      deps,
    );
    expect(r.status).toBe(200);
    const json = AnalyzeResponseSchema.parse(await r.json());
    expect(json.resultat.niveau).toBe("élevé");
    expect(json.partielle).toBeNull();
    expect(ia.appels).toHaveLength(0);
    expect(await lireDepenseDuJour(stockage, new Date(horloge.ms))).toBe(0);
  });
});

describe("traiterAnalyse : validation", () => {
  const erreur = async (r: Response) => ApiErrorSchema.parse(await r.json()).erreur;

  it("refuse une demande vide", async () => {
    const { deps } = creerContexteTest();
    const r = await traiterAnalyse(requeteAnalyse({}), deps);
    expect(r.status).toBe(400);
    expect((await erreur(r)).code).toBe("entree_invalide");
  });

  it("refuse autre chose que du multipart", async () => {
    const { deps } = creerContexteTest();
    const r = await traiterAnalyse(
      new Request("http://localhost/api/v1/analyze", {
        method: "POST",
        body: JSON.stringify({ texte: "x" }),
        headers: { "content-type": "application/json" },
      }),
      deps,
    );
    expect(r.status).toBe(415);
  });

  it("refuse un texte trop long", async () => {
    const { deps, ia } = creerContexteTest();
    const r = await traiterAnalyse(requeteAnalyse({ texte: "a".repeat(MAX_TEXT_CHARS + 1) }), deps);
    expect((await erreur(r)).code).toBe("entree_invalide");
    expect(ia.appels).toHaveLength(0);
  });

  it("refuse trop d'images, avec un message précis", async () => {
    const { deps, ia } = creerContexteTest();
    const images = Array.from({ length: MAX_IMAGES + 1 }, () => imagePng());
    const r = await traiterAnalyse(requeteAnalyse({ images }), deps);
    expect(r.status).toBe(400);
    expect((await erreur(r)).message).toBe(fr.erreursPrecises.tropDImages);
    expect(ia.appels).toHaveLength(0);
  });

  it("refuse un fichier qui n'est pas une image, même annoncé comme PNG", async () => {
    const { deps, ia } = creerContexteTest();
    const faux = new File(["<script>alert(1)</script>"], "x.png", { type: "image/png" });
    const r = await traiterAnalyse(requeteAnalyse({ images: [faux] }), deps);
    expect((await erreur(r)).code).toBe("image_invalide");
    expect(ia.appels).toHaveLength(0);
  });

  it("refuse une image trop lourde", async () => {
    const { deps } = creerContexteTest();
    const r = await traiterAnalyse(
      requeteAnalyse({ images: [imagePng(MAX_IMAGE_BYTES + 1)] }),
      deps,
    );
    const e = await erreur(r);
    expect(e.code).toBe("image_invalide");
    expect(e.message).toBe(fr.erreursPrecises.imageTropLourde);
  });

  it("refuse une requête trop volumineuse (413) avant de la lire", async () => {
    const { deps, ia } = creerContexteTest();
    const r = await traiterAnalyse(
      requeteAnalyse({ texte: "x" }, { "content-length": "9000000" }),
      deps,
    );
    expect(r.status).toBe(413);
    expect(ia.appels).toHaveLength(0);
  });

  it("refuse un champ « images » qui n'est pas un fichier", async () => {
    const { deps } = creerContexteTest();
    const form = new FormData();
    form.append("images", "du texte");
    const r = await traiterAnalyse(
      new Request("http://localhost/api/v1/analyze", { method: "POST", body: form }),
      deps,
    );
    expect((await erreur(r)).code).toBe("image_invalide");
  });

  it("refuse une requête déclenchée depuis un autre site", async () => {
    const { deps, ia } = creerContexteTest();
    const r = await traiterAnalyse(
      requeteAnalyse({ texte: CONVERSATION_BANALE }, { "sec-fetch-site": "cross-site" }),
      deps,
    );
    expect(r.status).toBe(403);
    expect(ia.appels).toHaveLength(0);
    for (const ok of ["same-origin", "same-site", "none"]) {
      const autre = await traiterAnalyse(
        requeteAnalyse(
          { texte: CONVERSATION_BANALE },
          { "sec-fetch-site": ok, "x-forwarded-for": "198.51.100.99" },
        ),
        deps,
      );
      expect(autre.status).toBe(200);
    }
  });

  it("les erreurs ont toujours la forme { erreur: { code, message } } sans détail interne", async () => {
    const { deps } = creerContexteTest();
    const r = await traiterAnalyse(requeteAnalyse({}), deps);
    const json = await corps<{ erreur: Record<string, unknown> }>(r);
    expect(Object.keys(json)).toEqual(["erreur"]);
    expect(Object.keys(json.erreur).sort()).toEqual(["code", "message"]);
  });
});

describe("traiterAnalyse : rate limit (10/heure, 30/jour par IP)", () => {
  it("accepte 10 analyses puis répond 429 avec Retry-After", async () => {
    const { deps } = creerContexteTest();
    for (let i = 0; i < 10; i++) {
      const r = await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_BANALE }), deps);
      expect(r.status).toBe(200);
    }
    const r = await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_BANALE }), deps);
    expect(r.status).toBe(429);
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(ApiErrorSchema.parse(await r.json()).erreur.code).toBe("trop_de_requetes");
  });

  it("refuse AVANT de lire le corps et avant tout appel à l'IA", async () => {
    const { deps, ia } = creerContexteTest({ env: { RATE_LIMIT_PER_HOUR: "1" } });
    await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_BANALE }), deps);
    const requete = requeteAnalyse({ texte: CONVERSATION_BANALE });
    const r = await traiterAnalyse(requete, deps);
    expect(r.status).toBe(429);
    expect(requete.bodyUsed).toBe(false);
    expect(ia.appels).toHaveLength(1);
  });

  it("les limites se règlent par variable d'environnement", async () => {
    const { deps } = creerContexteTest({
      env: { RATE_LIMIT_PER_HOUR: "2", RATE_LIMIT_PER_DAY: "3" },
    });
    const statuts: number[] = [];
    for (let i = 0; i < 4; i++) {
      statuts.push(
        (await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_BANALE }), deps)).status,
      );
    }
    expect(statuts).toEqual([200, 200, 429, 429]);
  });

  it("deux visiteurs ont chacun leur quota", async () => {
    const { deps } = creerContexteTest({ env: { RATE_LIMIT_PER_HOUR: "1" } });
    const de = (ip: string) =>
      traiterAnalyse(
        requeteAnalyse({ texte: CONVERSATION_BANALE }, { "x-forwarded-for": ip }),
        deps,
      );
    expect((await de("198.51.100.1")).status).toBe(200);
    expect((await de("198.51.100.1")).status).toBe(429);
    expect((await de("198.51.100.2")).status).toBe(200);
  });

  it("ne stocke jamais l'adresse IP en clair", async () => {
    const { deps, stockage } = creerContexteTest();
    await traiterAnalyse(
      requeteAnalyse({ texte: CONVERSATION_BANALE }, { "x-forwarded-for": "198.51.100.77" }),
      deps,
    );
    expect(stockage.cles().length).toBeGreaterThan(0);
    expect(stockage.cles().join(" ")).not.toContain("198.51.100.77");
  });
});

describe("traiterAnalyse : plafond de dépense (5 $/jour)", () => {
  it("inscrit le coût réel de chaque appel IA", async () => {
    const { deps, stockage, horloge } = creerContexteTest();
    await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_BANALE }), deps);
    // 3 000 jetons en entrée à 0,10 $/M + 800 en sortie à 0,50 $/M.
    expect(await lireDepenseDuJour(stockage, new Date(horloge.ms))).toBeCloseTo(0.0007, 6);
  });

  it("au-delà du plafond, l'IA est coupée et un texte reçoit une analyse partielle, pas une erreur", async () => {
    const { deps, ia } = creerContexteTest({ env: { DAILY_SPEND_CAP_USD: "0" } });
    const r = await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_SUSPECTE }), deps);
    expect(r.status).toBe(200);
    const json = AnalyzeResponseSchema.parse(await r.json());
    expect(json.resultat.meta.mode).toBe("regles_seules");
    expect(json.partielle).toEqual({ raison: "forte_affluence", message: fr.forteAffluence });
    expect(json.resultat.signaux.length).toBeGreaterThan(0);
    expect(ia.appels).toHaveLength(0);
  });

  it("le message de forte affluence est clair", () => {
    expect(fr.forteAffluence).toMatch(/forte affluence, analyse partielle/i);
  });

  it("des captures seules, plafond atteint : erreur claire (plafond_atteint), pas d'IA, Retry-After", async () => {
    const { deps, ia } = creerContexteTest({ env: { DAILY_SPEND_CAP_USD: "0" } });
    const r = await traiterAnalyse(requeteAnalyse({ images: [imagePng()] }), deps);
    expect(r.status).toBe(503);
    expect(ApiErrorSchema.parse(await r.json()).erreur.code).toBe("plafond_atteint");
    expect(Number(r.headers.get("retry-after"))).toBe(
      Math.ceil((Date.UTC(2026, 9, 27) - Date.UTC(2026, 9, 26, 12, 30)) / 1000),
    );
    expect(ia.appels).toHaveLength(0);
  });

  it("le plafond se règle par variable d'environnement et coupe l'IA en cours de journée", async () => {
    // Réservation maximale d'une analyse de texte ≈ 3 millièmes de dollar : 0,004 $ n'en couvre qu'une.
    const { deps, ia } = creerContexteTest({ env: { DAILY_SPEND_CAP_USD: "0.004" } });
    const modes: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_BANALE }), deps);
      modes.push((await corps(r)).resultat.meta.mode);
    }
    expect(modes[0]).toBe("complet");
    expect(modes).toContain("regles_seules");
    expect(ia.appels.length).toBeLessThan(4);
  });

  it("des analyses simultanées ne dépassent pas le plafond", async () => {
    const { deps, ia, stockage, horloge } = creerContexteTest({
      env: { DAILY_SPEND_CAP_USD: "0.02", RATE_LIMIT_PER_HOUR: "1000", RATE_LIMIT_PER_DAY: "1000" },
    });
    await Promise.all(
      Array.from({ length: 60 }, (_, i) =>
        traiterAnalyse(
          requeteAnalyse(
            { texte: CONVERSATION_BANALE },
            { "x-forwarded-for": `198.51.100.${i + 1}` },
          ),
          deps,
        ),
      ),
    );
    expect(ia.appels.length).toBeLessThan(60);
    expect(await lireDepenseDuJour(stockage, new Date(horloge.ms))).toBeLessThanOrEqual(0.02);
  });

  it("repart à zéro le lendemain (UTC)", async () => {
    const { deps, horloge, ia } = creerContexteTest({ env: { DAILY_SPEND_CAP_USD: "0.004" } });
    for (let i = 0; i < 3; i++)
      await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_BANALE }), deps);
    const avant = ia.appels.length;
    horloge.ms = Date.UTC(2026, 9, 27, 0, 5);
    const r = await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_BANALE }), deps);
    expect((await corps(r)).resultat.meta.mode).toBe("complet");
    expect(ia.appels.length).toBe(avant + 1);
  });

  it("une IA en échec rend sa réservation (aucun coût) et l'analyse est partielle", async () => {
    const ia = evaluateurFactice({ echec: { raison: "indisponible" } });
    const { deps, stockage, horloge } = creerContexteTest({ ia });
    const r = await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_SUSPECTE }), deps);
    expect(r.status).toBe(200);
    const json = AnalyzeResponseSchema.parse(await r.json());
    expect(json.partielle).toEqual({ raison: "ia_indisponible", message: fr.analysePartielle });
    expect(await lireDepenseDuJour(stockage, new Date(horloge.ms))).toBe(0);
  });

  it("un échec facturé (réponse tronquée) inscrit les jetons consommés", async () => {
    const ia = evaluateurFactice({
      echec: {
        raison: "tronquee",
        usage: { entree: 3000, sortie: 6000, cacheLecture: 0, cacheEcriture: 0 },
      },
    });
    const { deps, stockage, horloge } = creerContexteTest({ ia });
    await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_BANALE }), deps);
    // 3 000 × 0,10 $/M + 6 000 × 0,50 $/M.
    expect(await lireDepenseDuJour(stockage, new Date(horloge.ms))).toBeCloseTo(0.0033, 6);
  });

  it("un délai dépassé garde la réservation : l'appel a peut-être été facturé", async () => {
    const ia = evaluateurFactice({ echec: { raison: "delai" } });
    const { deps, stockage, horloge } = creerContexteTest({ ia });
    await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_BANALE }), deps);
    expect(await lireDepenseDuJour(stockage, new Date(horloge.ms))).toBeGreaterThan(0.001);
  });

  it("une analyse impossible (capture illisible) est quand même facturée au plafond", async () => {
    const ia = evaluateurFactice({
      reponse: reponseModele({ contenu_exploitable: false }),
    });
    const { deps, stockage, horloge } = creerContexteTest({ ia });
    const r = await traiterAnalyse(requeteAnalyse({ images: [imagePng()] }), deps);
    expect(ApiErrorSchema.parse(await r.json()).erreur.code).toBe("analyse_impossible");
    expect(await lireDepenseDuJour(stockage, new Date(horloge.ms))).toBeGreaterThan(0);
  });
});

describe("traiterAnalyse : sans clé d'API, en production, ou stockage en panne", () => {
  it("sans clé d'API : règles seules, sans erreur", async () => {
    const { deps } = creerContexteTest({ ia: null });
    const r = await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_SUSPECTE }), deps);
    expect(r.status).toBe(200);
    const json = AnalyzeResponseSchema.parse(await r.json());
    expect(json.resultat.meta.mode).toBe("regles_seules");
    expect(json.partielle?.raison).toBe("ia_indisponible");
  });

  it("en production sans Upstash, l'IA n'est JAMAIS appelée (ni rate limit ni plafond fiables)", async () => {
    const { deps, ia } = creerContexteTest({ env: { NODE_ENV: "production" } });
    const r = await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_SUSPECTE }), deps);
    expect(r.status).toBe(200);
    expect(AnalyzeResponseSchema.parse(await r.json()).partielle?.raison).toBe("ia_indisponible");
    expect(ia.appels).toHaveLength(0);
  });

  it("en production correctement configurée, l'IA est utilisée", async () => {
    const { deps, ia } = creerContexteTest({
      env: {
        NODE_ENV: "production",
        UPSTASH_REDIS_REST_URL: "https://x.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: "t",
      },
    });
    await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_BANALE }), deps);
    expect(ia.appels).toHaveLength(1);
  });

  it("stockage en panne : l'analyse est servie en règles seules, l'IA n'est pas appelée", async () => {
    const casse = new StockageMemoire();
    for (const m of ["incrementer", "lire", "poser", "prendre"] as const) {
      vi.spyOn(casse, m).mockRejectedValue(new Error("redis indisponible"));
    }
    const { deps, ia } = creerContexteTest({ stockage: casse });
    const r = await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_SUSPECTE }), deps);
    expect(r.status).toBe(200);
    const json = AnalyzeResponseSchema.parse(await r.json());
    expect(json.resultat.meta.mode).toBe("regles_seules");
    expect(json.partielle?.raison).toBe("ia_indisponible");
    expect(ia.appels).toHaveLength(0);
  });

  it("des captures seules avec un stockage en panne : ia_indisponible (pas de plafond annoncé à tort)", async () => {
    const casse = new StockageMemoire();
    for (const m of ["incrementer", "lire", "poser", "prendre"] as const) {
      vi.spyOn(casse, m).mockRejectedValue(new Error("redis indisponible"));
    }
    const { deps } = creerContexteTest({ stockage: casse });
    const r = await traiterAnalyse(requeteAnalyse({ images: [imagePng()] }), deps);
    expect(r.status).toBe(503);
    expect(ApiErrorSchema.parse(await r.json()).erreur.code).toBe("ia_indisponible");
  });
});

describe("traiterAnalyse : confidentialité", () => {
  it("ne journalise rien, ni sur un succès ni sur une erreur", async () => {
    const espions = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    const { deps } = creerContexteTest();
    await traiterAnalyse(
      requeteAnalyse({ texte: CONVERSATION_SUSPECTE, images: [imagePng()] }),
      deps,
    );
    await traiterAnalyse(requeteAnalyse({ texte: "a".repeat(MAX_TEXT_CHARS + 1) }), deps);
    await traiterAnalyse(requeteAnalyse({}), deps);
    for (const e of espions) expect(e).not.toHaveBeenCalled();
  });

  it("ne stocke aucun contenu : seules des clés techniques existent dans le stockage", async () => {
    const { deps, stockage } = creerContexteTest();
    await traiterAnalyse(
      requeteAnalyse({ texte: CONVERSATION_SUSPECTE, lien: "https://exemple.fr/x" }),
      deps,
    );
    const cles = stockage.cles();
    expect(cles.every((c) => /^(limite|depense|analyse|compteur):/.test(c))).toBe(true);
    expect(cles.join(" ")).not.toMatch(/whatsapp|virement|exemple/i);
  });
});
