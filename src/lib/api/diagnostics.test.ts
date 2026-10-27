import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalyzeResponseSchema } from "../contracts/api";
import { CODES_DIAGNOSTIC } from "../contracts/diagnostic";
import { ApiErrorSchema } from "../contracts/errors";
import { fr } from "../copy/fr";
import { trouverFormulationsInterdites } from "../copy/wording";
import { StockageMemoire } from "../security";
import { traiterAnalyse } from "./analyze";
import { creerDiagnostic } from "./diagnostic";
import {
  CONVERSATION_BANALE,
  CONVERSATION_SUSPECTE,
  creerContexteTest,
  evaluateurFactice,
  imagePng,
  requeteAnalyse,
} from "./test-utils";

afterEach(() => vi.restoreAllMocks());

const UPSTASH = { UPSTASH_REDIS_REST_URL: "https://x.upstash.io", UPSTASH_REDIS_REST_TOKEN: "t" };
const PRODUCTION = { NODE_ENV: "production", VERCEL_ENV: "production" };
const PUBLIC = { ...PRODUCTION, SHOW_DIAGNOSTICS: "false" };
const PREVIEW = { NODE_ENV: "production", VERCEL_ENV: "preview" };
/** Un nom de variable d'environnement (ANTHROPIC_API_KEY, DAILY_SPEND_CAP_USD…). */
const NOM_DE_VARIABLE = /\b[A-Z]{2,}(?:_[A-Z0-9]+)+\b/;

const reponseAnalyse = async (r: Response) => AnalyzeResponseSchema.parse(await r.json());
const erreur = async (r: Response) => ApiErrorSchema.parse(await r.json()).erreur;

describe("l'analyse partielle dit toujours pourquoi", () => {
  it("clé Anthropic absente (développement) : le message nomme la variable", async () => {
    const { deps } = creerContexteTest({ ia: null });
    const r = await reponseAnalyse(
      await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_SUSPECTE }), deps),
    );
    expect(r.partielle?.diagnostic?.code).toBe("ia_non_configuree");
    expect(r.partielle?.diagnostic?.message).toContain("ANTHROPIC_API_KEY");
  });

  it("clé absente en production : le détail nomme la variable (c'est le comportement par défaut)", async () => {
    const { deps } = creerContexteTest({ ia: null, env: { ...PRODUCTION, ...UPSTASH } });
    const r = await reponseAnalyse(
      await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_SUSPECTE }), deps),
    );
    expect(r.partielle?.diagnostic?.code).toBe("ia_non_configuree");
    expect(r.partielle?.diagnostic?.message).toContain("ANTHROPIC_API_KEY");
  });

  it("SHOW_DIAGNOSTICS=false : phrase générale, aucun nom de variable", async () => {
    const { deps } = creerContexteTest({ ia: null, env: { ...PUBLIC, ...UPSTASH } });
    const r = await reponseAnalyse(
      await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_SUSPECTE }), deps),
    );
    expect(r.partielle?.diagnostic?.code).toBe("ia_non_configuree");
    expect(r.partielle?.diagnostic?.message).not.toMatch(NOM_DE_VARIABLE);
  });

  it("preview sans Upstash : le message nomme les variables Upstash manquantes", async () => {
    const { deps, ia } = creerContexteTest({ env: PREVIEW });
    const r = await reponseAnalyse(
      await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_SUSPECTE }), deps),
    );
    expect(r.partielle?.diagnostic?.code).toBe("stockage_non_partage");
    expect(r.partielle?.diagnostic?.message).toMatch(/UPSTASH_REDIS_REST_URL.*KV_REST_API_URL/);
    expect(ia.appels).toHaveLength(0);
  });

  it("preview avec Upstash mais sans IP_HASH_SECRET : le message nomme le secret", async () => {
    const { deps } = creerContexteTest({ env: { ...PREVIEW, ...UPSTASH, IP_HASH_SECRET: "" } });
    const r = await reponseAnalyse(
      await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_SUSPECTE }), deps),
    );
    expect(r.partielle?.diagnostic).toMatchObject({ code: "secret_manquant" });
    expect(r.partielle?.diagnostic?.message).toContain("IP_HASH_SECRET");
  });

  it("SHOW_DIAGNOSTICS=false, production mal configurée : phrase générale sans nom de variable", async () => {
    const { deps } = creerContexteTest({ env: PUBLIC });
    const r = await reponseAnalyse(
      await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_SUSPECTE }), deps),
    );
    expect(r.partielle?.diagnostic?.code).toBe("stockage_non_partage");
    expect(r.partielle?.diagnostic?.message).toBe(fr.diagnostic.stockage_non_partage.public);
    expect(r.partielle?.diagnostic?.message).not.toMatch(NOM_DE_VARIABLE);
  });

  it("production sans rien configurer : toutes les variables manquantes sont listées d'un coup", async () => {
    const { deps } = creerContexteTest({
      ia: null,
      env: { ...PRODUCTION, ANTHROPIC_API_KEY: "", IP_HASH_SECRET: "" },
    });
    const r = await reponseAnalyse(
      await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_SUSPECTE }), deps),
    );
    const message = r.partielle?.diagnostic?.message ?? "";
    for (const variable of [
      "ANTHROPIC_API_KEY",
      "UPSTASH_REDIS_REST_URL",
      "UPSTASH_REDIS_REST_TOKEN",
      "IP_HASH_SECRET",
    ]) {
      expect(message, variable).toContain(variable);
    }
  });

  it("dit laquelle des deux variables Upstash manque", async () => {
    const { deps } = creerContexteTest({
      env: { ...PRODUCTION, UPSTASH_REDIS_REST_URL: "https://x.upstash.io" },
    });
    const r = await reponseAnalyse(
      await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_SUSPECTE }), deps),
    );
    const message = r.partielle?.diagnostic?.message ?? "";
    expect(message).toContain("UPSTASH_REDIS_REST_TOKEN");
    expect(message).not.toContain("UPSTASH_REDIS_REST_URL");
  });

  it("en développement, seule la clé Anthropic est exigée : pas de variable Upstash dans le message", async () => {
    const { deps } = creerContexteTest({ ia: null, env: { ANTHROPIC_API_KEY: "" } });
    const r = await reponseAnalyse(
      await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_SUSPECTE }), deps),
    );
    const message = r.partielle?.diagnostic?.message ?? "";
    expect(message).toContain("ANTHROPIC_API_KEY");
    expect(message).not.toContain("UPSTASH");
  });

  it("stockage en panne", async () => {
    const casse = new StockageMemoire();
    for (const m of ["incrementer", "lire", "poser", "prendre"] as const) {
      vi.spyOn(casse, m).mockRejectedValue(new Error("redis indisponible"));
    }
    const { deps } = creerContexteTest({ stockage: casse });
    const r = await reponseAnalyse(
      await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_SUSPECTE }), deps),
    );
    expect(r.partielle?.diagnostic?.code).toBe("stockage_indisponible");
  });

  it("plafond atteint : le détail nomme le réglage ; avec SHOW_DIAGNOSTICS=false le message de forte affluence suffit", async () => {
    const dev = creerContexteTest({ env: { DAILY_SPEND_CAP_USD: "0" } });
    const r1 = await reponseAnalyse(
      await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_SUSPECTE }), dev.deps),
    );
    expect(r1.partielle?.raison).toBe("forte_affluence");
    expect(r1.partielle?.diagnostic?.message).toContain("DAILY_SPEND_CAP_USD");

    const prod = creerContexteTest({
      env: { ...PUBLIC, ...UPSTASH, DAILY_SPEND_CAP_USD: "0" },
    });
    const r2 = await reponseAnalyse(
      await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_SUSPECTE }), prod.deps),
    );
    expect(r2.partielle?.raison).toBe("forte_affluence");
    expect(r2.partielle?.message).toBe(fr.forteAffluence);
    expect(r2.partielle?.diagnostic).toBeNull();
  });

  it("échec de configuration chez le fournisseur d'IA : le détail donne l'état HTTP", async () => {
    const ia = evaluateurFactice({ echec: { raison: "configuration" } });
    const { deps } = creerContexteTest({ ia });
    const r = await reponseAnalyse(
      await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_SUSPECTE }), deps),
    );
    expect(r.partielle?.diagnostic?.code).toBe("ia_echec_configuration");
    expect(r.partielle?.diagnostic?.message).toMatch(
      /HTTP 529.*ANTHROPIC_API_KEY.*ANTHROPIC_MODEL/,
    );
  });

  it.each([
    ["indisponible", "ia_echec_indisponible"],
    ["delai", "ia_echec_delai"],
    ["refus", "ia_echec_refus"],
    ["tronquee", "ia_echec_tronquee"],
    ["reponse_invalide", "ia_echec_reponse_invalide"],
  ] as const)("échec %s → diagnostic %s", async (raison, code) => {
    const ia = evaluateurFactice({ echec: { raison } });
    const { deps } = creerContexteTest({ ia });
    const r = await reponseAnalyse(
      await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_BANALE }), deps),
    );
    expect(r.partielle?.diagnostic?.code).toBe(code);
  });

  it("une analyse complète n'a ni bandeau ni diagnostic", async () => {
    const { deps } = creerContexteTest();
    const r = await reponseAnalyse(
      await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_BANALE }), deps),
    );
    expect(r.partielle).toBeNull();
  });

  it("un lien seul n'a pas d'IA à attendre : pas de diagnostic", async () => {
    const { deps } = creerContexteTest({ ia: null });
    const r = await reponseAnalyse(
      await traiterAnalyse(
        requeteAnalyse({ lien: "https://vinted.fr.paiement-securise.com/colis" }),
        deps,
      ),
    );
    expect(r.partielle).toBeNull();
  });
});

describe("des captures seules sans IA : l'erreur dit pourquoi", () => {
  it("clé absente (développement)", async () => {
    const { deps } = creerContexteTest({ ia: null });
    const r = await traiterAnalyse(requeteAnalyse({ images: [imagePng()] }), deps);
    expect(r.status).toBe(503);
    const e = await erreur(r);
    expect(e.code).toBe("ia_indisponible");
    expect(e.diagnostic?.code).toBe("ia_non_configuree");
    expect(e.diagnostic?.message).toContain("ANTHROPIC_API_KEY");
    expect(e.message).toMatch(/colle plutôt le texte/i);
  });

  it("preview sans Upstash", async () => {
    const { deps } = creerContexteTest({ env: PREVIEW });
    const e = await erreur(await traiterAnalyse(requeteAnalyse({ images: [imagePng()] }), deps));
    expect(e.diagnostic?.code).toBe("stockage_non_partage");
    expect(e.diagnostic?.message).toContain("UPSTASH_REDIS_REST_URL");
  });

  it("SHOW_DIAGNOSTICS=false : phrase générale", async () => {
    const { deps } = creerContexteTest({ env: PUBLIC });
    const e = await erreur(await traiterAnalyse(requeteAnalyse({ images: [imagePng()] }), deps));
    expect(e.diagnostic?.message).not.toMatch(NOM_DE_VARIABLE);
  });

  it("l'IA répond par une erreur de configuration", async () => {
    const ia = evaluateurFactice({ echec: { raison: "configuration" } });
    const { deps } = creerContexteTest({ ia });
    const e = await erreur(await traiterAnalyse(requeteAnalyse({ images: [imagePng()] }), deps));
    expect(e.code).toBe("ia_indisponible");
    expect(e.diagnostic?.code).toBe("ia_echec_configuration");
  });

  it("plafond atteint", async () => {
    const { deps } = creerContexteTest({ env: { DAILY_SPEND_CAP_USD: "0" } });
    const e = await erreur(await traiterAnalyse(requeteAnalyse({ images: [imagePng()] }), deps));
    expect(e.code).toBe("plafond_atteint");
    expect(e.diagnostic?.code).toBe("plafond_atteint");
  });
});

describe("journalisation des échecs de l'IA", () => {
  it("note le code d'échec et l'état HTTP, jamais le contenu", async () => {
    const erreurs = vi.spyOn(console, "error").mockImplementation(() => {});
    const ia = evaluateurFactice({ echec: { raison: "configuration" } });
    const { deps } = creerContexteTest({ ia });
    await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_SUSPECTE }), deps);
    expect(erreurs).toHaveBeenCalledTimes(1);
    const ligne = String(erreurs.mock.calls[0]?.[0]);
    expect(ligne).toContain("ia_echec_configuration");
    expect(ligne).toContain("HTTP 529");
    expect(ligne).not.toMatch(/whatsapp|virement|mandat/i);
  });

  it("ne note pas les pannes passagères (indisponible, délai)", async () => {
    const erreurs = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const raison of ["indisponible", "delai"] as const) {
      const { deps } = creerContexteTest({ ia: evaluateurFactice({ echec: { raison } }) });
      await traiterAnalyse(requeteAnalyse({ texte: CONVERSATION_BANALE }), deps);
    }
    expect(erreurs).not.toHaveBeenCalled();
  });
});

describe("creerDiagnostic", () => {
  it("tous les messages, publics et détaillés, respectent le wording prudent et ne sont pas vides", () => {
    for (const code of CODES_DIAGNOSTIC) {
      for (const detaille of [true, false]) {
        const d = creerDiagnostic(code, { detaille, technique: "HTTP 401" });
        if (d === null) {
          expect(code).toBe("plafond_atteint");
          expect(detaille).toBe(false);
          continue;
        }
        expect(d.message.trim()).not.toBe("");
        expect(trouverFormulationsInterdites(d.message), d.message).toEqual([]);
      }
    }
  });

  it("les messages publics ne contiennent aucun nom de variable ni détail HTTP", () => {
    for (const code of CODES_DIAGNOSTIC) {
      const d = creerDiagnostic(code, { detaille: false, technique: "HTTP 401" });
      if (d) {
        expect(d.message).not.toMatch(NOM_DE_VARIABLE);
        expect(d.message).not.toContain("HTTP");
      }
    }
  });
});
