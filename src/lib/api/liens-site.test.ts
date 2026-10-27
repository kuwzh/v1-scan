import { describe, expect, it } from "vitest";
import { AnalyzeResponseSchema } from "../contracts/api";
import { ApiErrorSchema } from "../contracts/errors";
import { fr } from "../copy/fr";
import { trouverFormulationsInterdites } from "../copy/wording";
import { traiterAnalyse } from "./analyze";
import { CONVERSATION_BANALE, creerContexteTest, requeteAnalyse } from "./test-utils";

const PHISHING = "https://vinted.fr.paiement-securise.com/colis";
const analyse = async (champs: Parameters<typeof requeteAnalyse>[0], sansIa = true) => {
  const { deps } = creerContexteTest(sansIa ? { ia: null } : {});
  return traiterAnalyse(requeteAnalyse(champs), deps);
};

describe("liens dans l'API", () => {
  it("un lien suspect dans le champ lien donne un résultat « élevé »", async () => {
    const r = AnalyzeResponseSchema.parse(await (await analyse({ lien: PHISHING })).json());
    expect(r.resultat.niveau).toBe("élevé");
    expect(r.avis).toEqual([]);
  });

  it("un lien suspect dans le texte aussi, même quand l'IA a lu la conversation", async () => {
    const r = AnalyzeResponseSchema.parse(
      await (await analyse({ texte: `Vendeur : paie ici ${PHISHING}` }, false)).json(),
    );
    expect(r.resultat.niveau).toBe("élevé");
  });

  it.each([
    ["https://www.vinted.fr/items/123456-sac-lv", "Vinted"],
    ["https://www.leboncoin.fr/ad/vetements/2987654321", "Leboncoin"],
    ["https://www.facebook.com/marketplace/item/123456", "Facebook Marketplace"],
  ])(
    "%s seul : « lecture d'annonce bientôt disponible », pas une erreur obscure",
    async (lien, site) => {
      const r = await analyse({ lien });
      expect(r.status).toBe(422);
      const e = ApiErrorSchema.parse(await r.json()).erreur;
      expect(e.code).toBe("lien_non_recuperable");
      expect(e.message).toBe(fr.lienAnnonce.erreur(site));
      expect(e.message).toMatch(/^Lecture d'annonce bientôt disponible/);
      expect(e.message).toContain("capture");
      expect(e.diagnostic).toBeUndefined();
    },
  );

  it("un autre lien sans signal : on dit qu'on ne lit pas le contenu des liens", async () => {
    const r = await analyse({ lien: "https://example-boutique.com/pay" });
    const e = ApiErrorSchema.parse(await r.json()).erreur;
    expect(e.code).toBe("lien_non_recuperable");
    expect(e.message).toBe(fr.lienAnnonce.autreLien);
  });

  it("un lien Vinted avec du texte : analyse faite, avis « lecture d'annonce bientôt disponible »", async () => {
    const r = AnalyzeResponseSchema.parse(
      await (
        await analyse({ lien: "https://www.vinted.fr/items/1", texte: CONVERSATION_BANALE }, false)
      ).json(),
    );
    expect(r.avis).toEqual([
      { code: "lien_annonce_non_lue", message: fr.lienAnnonce.avis("Vinted") },
    ]);
    expect(r.avis[0]?.message).toMatch(/^Lecture d'annonce bientôt disponible/);
  });

  it("les textes de lecture d'annonce respectent le wording prudent", () => {
    for (const site of Object.values(fr.lienAnnonce.sites)) {
      expect(trouverFormulationsInterdites(fr.lienAnnonce.erreur(site))).toEqual([]);
      expect(trouverFormulationsInterdites(fr.lienAnnonce.avis(site))).toEqual([]);
    }
    expect(trouverFormulationsInterdites(fr.lienAnnonce.autreLien)).toEqual([]);
  });
});

describe("site choisi dans l'API", () => {
  const score = async (site?: string) => {
    const r = await analyse({ texte: "paiement paypal", ...(site ? { site } : {}) });
    expect(r.status).toBe(200);
    return AnalyzeResponseSchema.parse(await r.json()).resultat.score;
  };

  it("« paiement paypal » : au moins « moyen » sur Vinted, « autre » et sans site", async () => {
    expect(await score("vinted")).toBeGreaterThanOrEqual(30);
    expect(await score("autre")).toBeGreaterThanOrEqual(30);
    expect(await score()).toBeGreaterThanOrEqual(30);
  });

  it("poids réduits sur Leboncoin et Marketplace", async () => {
    expect(await score("leboncoin")).toBeLessThan(30);
    expect(await score("facebook_marketplace")).toBeLessThan(30);
  });

  it("un site inconnu est refusé", async () => {
    const r = await analyse({ texte: "paiement paypal", site: "ebay" });
    expect(r.status).toBe(400);
  });

  it("un site vide est ignoré (poids stricts)", async () => {
    expect(await score("")).toBeGreaterThanOrEqual(30);
  });
});
