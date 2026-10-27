import { describe, expect, it } from "vitest";
import { normaliserReponse } from "../ai/normaliser";
import { reponseModele } from "../ai/test-utils";
import type { EntreeIa, EvaluerIa } from "../ai/types";
import { analyserDemande } from "./pipeline";

const MAINTENANT = () => new Date("2026-10-26T10:00:00Z");
const PHISHING = "https://vinted.fr.paiement-securise.com/colis";

/** IA qui lit la conversation normalement, et rapporte les liens qu'on lui fait rapporter. */
function ia(liensRapportes: string[] = []): EvaluerIa {
  return async (entree: EntreeIa) => {
    const r = reponseModele();
    r.donnees_extraites.liens = liensRapportes;
    const { evaluation, avertissements } = normaliserReponse(r, {
      texteSource: entree.images.length === 0 ? entree.texte : null,
    });
    return {
      ok: true as const,
      evaluation,
      avertissements,
      usage: { entree: 1, sortie: 1, cacheLecture: 0, cacheEcriture: 0 },
      dureeMs: 1,
      modele: "claude-haiku-5-5",
    };
  };
}
const deps = (evaluerIa: EvaluerIa | null) => ({ evaluerIa, maintenant: MAINTENANT });

describe("liens du texte collé : toujours analysés", () => {
  it("sans IA", async () => {
    const r = await analyserDemande({ images: [], texte: `Paie ici : ${PHISHING}` }, deps(null));
    expect(r.ok && r.resultat.niveau).toBe("élevé");
  });

  it("même quand l'IA a lu la conversation et n'a pas rapporté le lien", async () => {
    const r = await analyserDemande(
      { images: [], texte: `Vendeur : Paie ici : ${PHISHING}` },
      deps(ia([])),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.resultat.niveau).toBe("élevé");
    expect(r.resultat.signaux.map((s) => s.id)).toContain("lien.sous_domaine_piege");
  });

  it("sans doublon quand l'IA le rapporte aussi", async () => {
    const r = await analyserDemande(
      { images: [], texte: `Vendeur : Paie ici : ${PHISHING}` },
      deps(ia([PHISHING])),
    );
    expect(r.ok && r.liens.filter((l) => l.verdict === "suspect")).toHaveLength(1);
  });

  it("un lien écrit avec des espaces ou [.] dans le texte est nettoyé puis analysé", async () => {
    const r = await analyserDemande(
      { images: [], texte: "Vendeur : va sur vinted-paiement[.]com/verif pour recevoir l'argent" },
      deps(ia([])),
    );
    expect(r.ok && r.resultat.niveau).toBe("élevé");
  });
});

describe("champ lien", () => {
  it.each([PHISHING, "vinted-paiement.com/verif", "https://bit.ly/3xYz"])(
    "%s est analysé, seul ou avec du texte, avec ou sans IA",
    async (lien) => {
      for (const evaluerIa of [null, ia([])]) {
        const seul = await analyserDemande({ images: [], lien }, deps(evaluerIa));
        expect(seul.ok && seul.liens.map((l) => l.verdict)).toContain("suspect");
        const avecTexte = await analyserDemande(
          { images: [], lien, texte: "Vendeur : bonjour, oui dispo." },
          deps(evaluerIa),
        );
        expect(avecTexte.ok && avecTexte.liens.map((l) => l.verdict)).toContain("suspect");
        // Les imitations de marque et sous-domaines piégés montent au plancher des liens critiques.
        if (lien !== "https://bit.ly/3xYz") {
          expect(avecTexte.ok && avecTexte.resultat.score).toBeGreaterThanOrEqual(75);
        }
      }
    },
  );

  it("un faux lien d'annonce (imitation de Vinted) est un lien suspect, pas une annonce non lue", async () => {
    const r = await analyserDemande(
      { images: [], lien: "vinted-paiement.com/items/1" },
      deps(null),
    );
    expect(r.ok && r.lienAnnonce).toBeNull();
    expect(r.ok && r.resultat.niveau).toBe("élevé");
  });
});

describe("lecture d'annonce par lien : pas encore disponible", () => {
  it.each([
    ["https://www.vinted.fr/items/123456-sac-lv", "vinted"],
    ["https://www.leboncoin.fr/ad/vetements/2987654321", "leboncoin"],
    ["https://www.facebook.com/marketplace/item/123456", "facebook_marketplace"],
  ] as const)("%s seul : erreur qui nomme le site", async (lien, site) => {
    const r = await analyserDemande({ images: [], lien }, deps(null));
    expect(r).toMatchObject({ ok: false, code: "lien_non_recuperable", lienAnnonce: site });
  });

  it("un autre lien sans signal : même erreur, sans site", async () => {
    const r = await analyserDemande(
      { images: [], lien: "https://example-boutique.com/pay" },
      deps(null),
    );
    expect(r).toMatchObject({ ok: false, code: "lien_non_recuperable", lienAnnonce: null });
  });

  it("avec du texte, l'analyse a lieu et le site du lien non lu est signalé", async () => {
    const r = await analyserDemande(
      {
        images: [],
        lien: "https://www.vinted.fr/items/1",
        texte: "Vendeur : on continue sur WhatsApp ?",
      },
      deps(null),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lienAnnonce).toBe("vinted");
    expect(r.resultat.signaux.map((s) => s.id)).toContain("plateforme.whatsapp");
  });

  it("une annonce Vinted collée dans le texte (pas dans le champ lien) n'est pas signalée", async () => {
    const r = await analyserDemande(
      { images: [], texte: "Vendeur : voici l'annonce https://www.vinted.fr/items/1" },
      deps(null),
    );
    expect(r.ok && r.lienAnnonce).toBeNull();
  });
});

describe("site choisi par l'utilisateur", () => {
  it("« paiement paypal » : moyen sur Vinted, sur « autre » et sans site ; réduit sur Leboncoin", async () => {
    const score = async (
      site: "vinted" | "autre" | "leboncoin" | "facebook_marketplace" | null,
    ) => {
      const r = await analyserDemande({ images: [], texte: "paiement paypal", site }, deps(null));
      return r.ok ? r.resultat.score : -1;
    };
    expect(await score("vinted")).toBeGreaterThanOrEqual(30);
    expect(await score("autre")).toBeGreaterThanOrEqual(30);
    expect(await score(null)).toBeGreaterThanOrEqual(30);
    expect(await score("leboncoin")).toBeLessThan(30);
    expect(await score("facebook_marketplace")).toBeLessThan(30);
  });

  it("avec une IA bien moins sévère, le résultat reste au moins « moyen » sur Vinted", async () => {
    const lecture: EvaluerIa = async (entree: EntreeIa) => {
      const r = reponseModele({ score: 5, niveau: "faible" });
      r.donnees_extraites.messages = [
        { auteur: "vendeur", confiance: "haute", texte: "paiement paypal" },
      ];
      const { evaluation, avertissements } = normaliserReponse(r, {
        texteSource: entree.images.length === 0 ? entree.texte : null,
      });
      return {
        ok: true as const,
        evaluation,
        avertissements,
        usage: { entree: 1, sortie: 1, cacheLecture: 0, cacheEcriture: 0 },
        dureeMs: 1,
        modele: "claude-haiku-5-5",
      };
    };
    const r = await analyserDemande(
      { images: [], texte: "Vendeur : paiement paypal", site: "vinted" },
      deps(lecture),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.resultat.meta.score_ia).toBe(5);
    expect(r.resultat.score).toBeGreaterThanOrEqual(30);
    expect(r.resultat.niveau).toBe("moyen");
  });
});
