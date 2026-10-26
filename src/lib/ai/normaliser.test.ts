import { describe, expect, it } from "vitest";
import { AiEvaluationSchema } from "../contracts/ai";
import { donneesExtraitesVides } from "../contracts/extracted";
import { donneesVides, normaliserReponse } from "./normaliser";
import { reponseModele } from "./test-utils";
import type { ReponseModele } from "./wire";

/** Réponse de base dont on modifie les données extraites. */
function reponse(modifier: (d: ReponseModele["donnees_extraites"]) => void): ReponseModele {
  const r = reponseModele();
  modifier(r.donnees_extraites);
  return r;
}
const normaliser = (r: ReponseModele, texteSource?: string | null) =>
  normaliserReponse(r, { texteSource });

describe("valeurs : jamais corrigées, seulement écartées", () => {
  it("garde une réponse plausible telle quelle, confiances comprises", () => {
    const { evaluation, avertissements } = normaliser(reponseModele());
    const d = evaluation.donnees_extraites;
    expect(d.annonce.prix_eur).toBe(15);
    expect(d.vendeur.nombre_avis).toBe(120);
    expect(d.confiance.vendeur.nombre_avis).toBe("haute");
    expect(d.confiance.vendeur.anciennete_jours).toBe("moyenne");
    expect(avertissements.valeursInvalides).toEqual([]);
    expect(AiEvaluationSchema.safeParse(evaluation).success).toBe(true);
  });

  it.each([
    [
      "prix négatif",
      (d: ReponseModele["donnees_extraites"]) => (d.annonce.prix_eur = -5),
      "annonce.prix_eur",
    ],
    [
      "prix démesuré",
      (d: ReponseModele["donnees_extraites"]) => (d.annonce.prix_eur = 5e7),
      "annonce.prix_eur",
    ],
    [
      "avis négatif",
      (d: ReponseModele["donnees_extraites"]) => (d.vendeur.nombre_avis = -3),
      "vendeur.nombre_avis",
    ],
    [
      "avis démesuré",
      (d: ReponseModele["donnees_extraites"]) => (d.vendeur.nombre_avis = 1e9),
      "vendeur.nombre_avis",
    ],
    [
      "note de 7 sur 5",
      (d: ReponseModele["donnees_extraites"]) => (d.vendeur.note_sur_5 = 7),
      "vendeur.note_sur_5",
    ],
    [
      "ancienneté de 300 ans",
      (d: ReponseModele["donnees_extraites"]) => (d.vendeur.anciennete_jours = 109_500),
      "vendeur.anciennete_jours",
    ],
    [
      "photos : NaN",
      (d: ReponseModele["donnees_extraites"]) => (d.annonce.nombre_photos = Number.NaN),
      "annonce.nombre_photos",
    ],
  ])("%s → null, confiance effacée, signalé", (_nom, modifier, chemin) => {
    const { evaluation, avertissements } = normaliser(reponse(modifier));
    const [groupe, cle] = chemin.split(".") as ["annonce" | "vendeur", string];
    expect((evaluation.donnees_extraites[groupe] as Record<string, unknown>)[cle]).toBeNull();
    expect(
      (evaluation.donnees_extraites.confiance[groupe] as Record<string, unknown>)[cle],
    ).toBeNull();
    expect(avertissements.valeursInvalides).toContain(chemin);
  });

  it("arrondit les nombres entiers et les prix au centime", () => {
    const { evaluation } = normaliser(
      reponse((d) => {
        d.vendeur.nombre_avis = 11.6;
        d.annonce.prix_eur = 12.3456;
      }),
    );
    expect(evaluation.donnees_extraites.vendeur.nombre_avis).toBe(12);
    expect(evaluation.donnees_extraites.annonce.prix_eur).toBe(12.35);
  });

  it("une note avec « 0 avis » est incohérente : écartée", () => {
    const { evaluation, avertissements } = normaliser(
      reponse((d) => {
        d.vendeur.nombre_avis = 0;
        d.vendeur.note_sur_5 = 5;
      }),
    );
    expect(evaluation.donnees_extraites.vendeur.nombre_avis).toBe(0);
    expect(evaluation.donnees_extraites.vendeur.note_sur_5).toBeNull();
    expect(avertissements.valeursInvalides.join()).toContain("note_sur_5");
  });

  it("une chaîne vide ou faite d'espaces devient null", () => {
    const { evaluation } = normaliser(
      reponse((d) => {
        d.annonce.titre = "   ";
        d.annonce.marque = "";
        d.vendeur.localisation = " Lyon \n ";
      }),
    );
    expect(evaluation.donnees_extraites.annonce.titre).toBeNull();
    expect(evaluation.donnees_extraites.annonce.marque).toBeNull();
    expect(evaluation.donnees_extraites.vendeur.localisation).toBe("Lyon");
  });
});

describe("confiance", () => {
  it("une donnée présente sans confiance reçoit « basse » : les règles l'ignoreront", () => {
    const { evaluation } = normaliser(
      reponse((d) => {
        d.confiance.vendeur.nombre_avis = null;
        d.confiance.annonce.prix_eur = null;
      }),
    );
    expect(evaluation.donnees_extraites.vendeur.nombre_avis).toBe(120);
    expect(evaluation.donnees_extraites.confiance.vendeur.nombre_avis).toBe("basse");
    expect(evaluation.donnees_extraites.confiance.annonce.prix_eur).toBe("basse");
  });

  it("une donnée absente n'a pas de confiance, même si l'IA en a annoncé une", () => {
    const { evaluation } = normaliser(
      reponse((d) => {
        d.vendeur.anciennete_jours = null;
        d.confiance.vendeur.anciennete_jours = "haute";
      }),
    );
    expect(evaluation.donnees_extraites.vendeur.anciennete_jours).toBeNull();
    expect(evaluation.donnees_extraites.confiance.vendeur.anciennete_jours).toBeNull();
  });

  it("garde les trois niveaux de confiance annoncés", () => {
    const { evaluation } = normaliser(
      reponse((d) => {
        d.confiance.vendeur.nombre_avis = "basse";
        d.confiance.vendeur.note_sur_5 = "moyenne";
        d.confiance.vendeur.profil_verifie = "haute";
      }),
    );
    const c = evaluation.donnees_extraites.confiance.vendeur;
    expect([c.nombre_avis, c.note_sur_5, c.profil_verifie]).toEqual(["basse", "moyenne", "haute"]);
  });
});

describe("messages et liens inventés (texte collé, sans capture)", () => {
  const source = [
    "Bonjour, il est toujours dispo ?",
    "Oui ! Je l'envoie demain via Vinted.",
    "Super, vous acceptez les virements ?",
  ].join("\n");

  const messages = (...textes: Array<["vendeur" | "acheteur" | "inconnu", string]>) =>
    reponse((d) => {
      d.messages = textes.map(([auteur, texte]) => ({ auteur, confiance: "haute", texte }));
    });

  it("garde les messages qui figurent dans le texte, même légèrement recopiés", () => {
    const { evaluation, avertissements } = normaliser(
      messages(
        ["acheteur", "Bonjour, il est toujours dispo ?"],
        ["vendeur", "Oui ! Je l'envoie demain via Vinted."],
        ["acheteur", "Super, [nom], vous acceptez les virements"],
      ),
      source,
    );
    expect(evaluation.donnees_extraites.messages).toHaveLength(3);
    expect(avertissements.messagesEcartes).toBe(0);
  });

  it("écarte un message absent du texte", () => {
    const { evaluation, avertissements } = normaliser(
      messages(
        ["vendeur", "Oui ! Je l'envoie demain via Vinted."],
        ["vendeur", "Écris-moi sur WhatsApp au 06 12 34 56 78 pour finaliser le virement"],
      ),
      source,
    );
    expect(evaluation.donnees_extraites.messages.map((m) => m.texte)).toEqual([
      "Oui ! Je l'envoie demain via Vinted.",
    ]);
    expect(avertissements.messagesEcartes).toBe(1);
  });

  it("écarte un lien absent du texte, garde celui qui y figure", () => {
    const r = reponse((d) => {
      d.liens = ["vinted-paiement.com/pay", "bit.ly/3xYz"];
    });
    const { evaluation, avertissements } = normaliser(
      r,
      "Paie ici : https://www.vinted-paiement.com/pay merci",
    );
    expect(evaluation.donnees_extraites.liens).toEqual(["vinted-paiement.com/pay"]);
    expect(avertissements.liensEcartes).toBe(1);
  });

  it("reconnaît un lien « défangué » dans le texte", () => {
    const r = reponse((d) => {
      d.liens = ["vinted-paiement.com"];
    });
    const { evaluation } = normaliser(r, "va sur vinted-paiement[.]com");
    expect(evaluation.donnees_extraites.liens).toEqual(["vinted-paiement.com"]);
  });

  it("ne vérifie rien quand il y a des captures (pas de texte source) ou pas de texte", () => {
    const r = messages(["vendeur", "Un message qu'on ne peut pas retrouver ailleurs"]);
    expect(normaliser(r, null).evaluation.donnees_extraites.messages).toHaveLength(1);
    expect(normaliser(r, undefined).evaluation.donnees_extraites.messages).toHaveLength(1);
    expect(normaliser(r, "   ").evaluation.donnees_extraites.messages).toHaveLength(1);
  });
});

describe("limites", () => {
  it("borne le score et ignore un score non numérique", () => {
    expect(normaliser(reponseModele({ score: 250 })).evaluation.score).toBe(100);
    expect(normaliser(reponseModele({ score: -4 })).evaluation.score).toBe(0);
    expect(normaliser(reponseModele({ score: 41.6 })).evaluation.score).toBe(42);
    expect(normaliser(reponseModele({ score: Number.NaN })).evaluation.score).toBe(0);
  });

  it("plafonne le nombre de messages, de liens, de signaux et de conseils", () => {
    const r = reponseModele({
      signaux: Array.from({ length: 30 }, (_, i) => ({
        label: `signal ${i}`,
        gravite: "info" as const,
      })),
      conseils: Array.from({ length: 30 }, (_, i) => `conseil numéro ${i}`),
    });
    r.donnees_extraites.messages = Array.from({ length: 100 }, (_, i) => ({
      auteur: "vendeur" as const,
      confiance: "haute" as const,
      texte: `message ${i}`,
    }));
    r.donnees_extraites.liens = Array.from({ length: 50 }, (_, i) => `site${i}.com`);
    const { evaluation } = normaliser(r);
    expect(evaluation.donnees_extraites.messages).toHaveLength(60);
    expect(evaluation.donnees_extraites.liens).toHaveLength(20);
    expect(evaluation.signaux).toHaveLength(12);
    expect(evaluation.conseils).toHaveLength(8);
  });

  it("coupe les textes démesurés", () => {
    const r = reponse((d) => {
      d.annonce.titre = "t".repeat(1000);
      d.messages = [{ auteur: "vendeur", confiance: "haute", texte: "m".repeat(9000) }];
    });
    const { evaluation } = normaliser(r);
    expect(evaluation.donnees_extraites.annonce.titre).toHaveLength(200);
    expect(evaluation.donnees_extraites.messages[0]?.texte).toHaveLength(2000);
  });

  it("écarte les messages vides et dédoublonne les liens", () => {
    const r = reponse((d) => {
      d.messages = [
        { auteur: "vendeur", confiance: "haute", texte: "   " },
        { auteur: "vendeur", confiance: "haute", texte: "Bonjour" },
      ];
      d.liens = ["site.com", "SITE.com", " site.com "];
    });
    const { evaluation } = normaliser(r);
    expect(evaluation.donnees_extraites.messages).toHaveLength(1);
    expect(evaluation.donnees_extraites.liens).toEqual(["site.com"]);
  });

  it("conserve contenu_exploitable", () => {
    expect(
      normaliser(reponseModele({ contenu_exploitable: false })).evaluation.contenu_exploitable,
    ).toBe(false);
  });
});

describe("donneesVides", () => {
  it("vrai sans aucune donnée, faux dès qu'une donnée est présente", () => {
    const d = donneesExtraitesVides();
    expect(donneesVides(d)).toBe(true);
    d.vendeur.nombre_avis = 0;
    expect(donneesVides(d)).toBe(false);
    d.vendeur.nombre_avis = null;
    d.liens = ["site.com"];
    expect(donneesVides(d)).toBe(false);
  });
});
