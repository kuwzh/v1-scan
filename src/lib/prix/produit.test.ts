import { describe, expect, it } from "vitest";
import { donneesExtraitesVides, type ExtractedData } from "../contracts/extracted";
import { evaluerRegles } from "../rules/moteur";
import { analyserLiens } from "../links/analyse";
import { contexteScoreDepuis, decoderProduit, encoderProduit, produitComparable } from "./produit";
import type { ContexteScore } from "./recalcul";

function donnees(
  annonce: Partial<ExtractedData["annonce"]> = {},
  confiance: Partial<ExtractedData["confiance"]["annonce"]> = {},
): ExtractedData {
  const d = donneesExtraitesVides();
  d.annonce = {
    ...d.annonce,
    titre: "Sac Speedy 30",
    prix_eur: 250,
    marque: "Louis Vuitton",
    modele: "Speedy 30",
    categorie: "sac à main",
    etat: "Bon état",
    ...annonce,
  };
  d.confiance.annonce = {
    ...d.confiance.annonce,
    prix_eur: "haute",
    marque: "haute",
    modele: "haute",
    etat: "haute",
    ...confiance,
  };
  return d;
}

describe("produitComparable : la recherche payante n'a lieu que si l'article est bien identifié", () => {
  it("marque et modèle de confiance haute, prix présent : comparable", () => {
    expect(produitComparable(donnees())).toEqual({
      marque: "Louis Vuitton",
      modele: "Speedy 30",
      categorie: "sac à main",
      etat: "bon",
      prixEur: 250,
    });
  });

  it("nettoie les espaces et range l'état en catégorie", () => {
    const p = produitComparable(
      donnees({ marque: "  Apple ", modele: " iPhone 13 ", etat: "Comme neuf" }),
    );
    expect(p).toMatchObject({ marque: "Apple", modele: "iPhone 13", etat: "tres_bon" });
  });

  it("état absent : « inconnu » ; catégorie absente : null", () => {
    const p = produitComparable(donnees({ etat: null, categorie: null }));
    expect(p).toMatchObject({ etat: "inconnu", categorie: null });
  });

  it.each([
    ["marque absente", { marque: null }, {}],
    ["marque vide", { marque: "   " }, {}],
    ["modèle absent", { modele: null }, {}],
    ["marque de confiance moyenne", {}, { marque: "moyenne" as const }],
    ["modèle de confiance moyenne", {}, { modele: "moyenne" as const }],
    ["modèle de confiance basse", {}, { modele: "basse" as const }],
    ["modèle sans confiance", {}, { modele: null }],
    ["prix absent", { prix_eur: null }, {}],
    ["prix nul", { prix_eur: 0 }, {}],
    ["prix négatif", { prix_eur: -5 }, {}],
    ["prix démesuré", { prix_eur: 5_000_000 }, {}],
    ["prix de confiance basse", {}, { prix_eur: "basse" as const }],
    ["prix sans confiance", {}, { prix_eur: null }],
  ])("%s : non comparable", (_nom, annonce, confiance) => {
    expect(produitComparable(donnees(annonce, confiance))).toBeNull();
  });

  it("un prix de confiance moyenne suffit", () => {
    expect(produitComparable(donnees({}, { prix_eur: "moyenne" }))).not.toBeNull();
  });

  it("des données vides ne sont pas comparables", () => {
    expect(produitComparable(donneesExtraitesVides())).toBeNull();
  });
});

describe("contexteScoreDepuis", () => {
  const regles = (annonce: Partial<ExtractedData["annonce"]>, texte: string | null = null) =>
    evaluerRegles({ donnees: donnees(annonce), texte, liens: analyserLiens([]) });

  it("sépare le signal de la table de prix des autres poids", () => {
    const r = regles({ prix_eur: 20 }, "Vendeur : écris-moi sur WhatsApp.");
    expect(r.constats.some((c) => c.id === "prix.tres_bas")).toBe(true);
    const ctx = contexteScoreDepuis(r, 10, r.score);
    expect(ctx.prixTable).toEqual({ id: "prix.tres_bas", gravite: "importante", poids: 0.38 });
    expect(ctx.poids).toHaveLength(r.constats.length - 1);
    expect(ctx.poids).not.toContain(0.38);
  });

  it("sans signal de prix : prixTable est null et tous les poids sont gardés", () => {
    const r = regles({ prix_eur: 800 }, "Vendeur : écris-moi sur WhatsApp.");
    const ctx = contexteScoreDepuis(r, null, r.score);
    expect(ctx.prixTable).toBeNull();
    expect(ctx.poids).toEqual(r.constats.map((c) => c.poids));
    expect(ctx.poids.length).toBeGreaterThan(0);
  });

  it("garde le plancher, la remise, le score de l'IA et le score affiché", () => {
    const r = regles({ prix_eur: 800 });
    expect(contexteScoreDepuis(r, 33, 41)).toMatchObject({
      plancher: r.plancher,
      remise: r.remise,
      scoreIa: 33,
      score: 41,
    });
  });

  it("ne garde que des nombres et des identifiants : rien du texte analysé", () => {
    const r = regles(
      { prix_eur: 20 },
      "Vendeur : mon numéro est 06 12 34 56 78, écris-moi sur WhatsApp.",
    );
    const brut = JSON.stringify(contexteScoreDepuis(r, 10, r.score));
    expect(brut).not.toMatch(/WhatsApp|06 12|numéro/);
  });
});

describe("encoderProduit / decoderProduit", () => {
  const produit =
    produitComparable(donnees()) ??
    (() => {
      throw new Error("produit attendu");
    })();
  const contexte: ContexteScore = {
    poids: [0.4, 0.22],
    plancher: null,
    remise: 5,
    scoreIa: 30,
    prixTable: { id: "prix.bas", gravite: "attention", poids: 0.22 },
    score: 48,
  };

  it("fait l'aller-retour sans perte", () => {
    expect(decoderProduit(encoderProduit(produit, contexte))).toEqual({ produit, contexte });
  });

  it("absent → null", () => {
    expect(decoderProduit(null)).toBeNull();
  });

  it.each([
    ["pas du JSON", "{pas du json"],
    ["tableau", "[]"],
    ["champs manquants", '{"marque":"x"}'],
  ])("%s → null", (_nom, brut) => {
    expect(decoderProduit(brut)).toBeNull();
  });

  it.each([
    ["état inconnu", (o: Record<string, unknown>) => ({ ...o, etat: "excellent" })],
    ["prix négatif", (o: Record<string, unknown>) => ({ ...o, prix_eur: -1 })],
    ["marque trop longue", (o: Record<string, unknown>) => ({ ...o, marque: "x".repeat(500) })],
    [
      "poids hors de [0, 1]",
      (o: Record<string, unknown>) => ({
        ...o,
        contexte: { ...(o.contexte as object), poids: [2] },
      }),
    ],
    [
      "score hors de [0, 100]",
      (o: Record<string, unknown>) => ({
        ...o,
        contexte: { ...(o.contexte as object), score: 140 },
      }),
    ],
    [
      "gravité inconnue",
      (o: Record<string, unknown>) => ({
        ...o,
        contexte: {
          ...(o.contexte as object),
          prixTable: { id: "x", gravite: "énorme", poids: 0.2 },
        },
      }),
    ],
  ])("un enregistrement altéré (%s) → null", (_nom, alterer) => {
    const sain = JSON.parse(encoderProduit(produit, contexte)) as Record<string, unknown>;
    expect(decoderProduit(JSON.stringify(alterer(sain)))).toBeNull();
  });

  it("tronque les chaînes trop longues avant d'écrire", () => {
    const long = { ...produit, marque: "m".repeat(300), modele: "n".repeat(300) };
    const lu = decoderProduit(encoderProduit(long, contexte));
    expect(lu?.produit.marque).toHaveLength(120);
    expect(lu?.produit.modele).toHaveLength(120);
  });
});
