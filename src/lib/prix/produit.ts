import { z } from "zod";
import type { ExtractedData } from "../contracts/extracted";
import { GraviteSchema } from "../contracts/signals";
import type { ResultatRegles } from "../rules/types";
import { ETATS, categoriserEtat, type EtatArticle } from "./cache";
import type { ContexteScore } from "./recalcul";

/** Le signal « prix » de la table de marques (`rules/prix.ts`) : la comparaison le remplace. */
const ID_PRIX_TABLE = /^prix\./;

/**
 * Ce que la comparaison de prix a besoin de retrouver d'une analyse : l'article (marque, modèle,
 * catégorie, état), le prix annoncé et de quoi recalculer le score. Des données de produit et des
 * nombres, aucune conversation ni capture.
 */
export interface ProduitComparable {
  marque: string;
  modele: string;
  categorie: string | null;
  etat: EtatArticle;
  prixEur: number;
}

/**
 * L'article à comparer, ou `null` si la recherche payante n'est pas justifiée : marque ET modèle
 * doivent avoir été lus avec une confiance haute, et le prix avec une confiance au moins moyenne.
 * Sinon, seule la table de prix existante joue.
 */
export function produitComparable(donnees: ExtractedData): ProduitComparable | null {
  const { annonce, confiance } = donnees;
  const marque = annonce.marque?.trim();
  const modele = annonce.modele?.trim();
  if (!marque || !modele) return null;
  if (confiance.annonce.marque !== "haute" || confiance.annonce.modele !== "haute") return null;
  const prix = annonce.prix_eur;
  if (prix === null || !(prix > 0) || prix > 1_000_000) return null;
  if (confiance.annonce.prix_eur !== "haute" && confiance.annonce.prix_eur !== "moyenne") {
    return null;
  }
  return {
    marque,
    modele,
    categorie: annonce.categorie?.trim() || null,
    etat: categoriserEtat(annonce.etat),
    prixEur: prix,
  };
}

/** Ce que les règles ont compté dans le score, pour y ajouter le prix sans les relancer. */
export function contexteScoreDepuis(
  regles: Pick<ResultatRegles, "constats" | "plancher" | "remise">,
  scoreIa: number | null,
  score: number,
): ContexteScore {
  const table = regles.constats.find((c) => ID_PRIX_TABLE.test(c.id));
  return {
    poids: regles.constats.filter((c) => !ID_PRIX_TABLE.test(c.id)).map((c) => c.poids),
    plancher: regles.plancher,
    remise: regles.remise,
    scoreIa,
    prixTable: table ? { id: table.id, gravite: table.gravite, poids: table.poids } : null,
    score,
  };
}

const Poids = z.number().min(0).max(1);
const Entier100 = z.number().int().min(0).max(100);

const EnregistrementSchema = z.object({
  marque: z.string().min(1).max(120),
  modele: z.string().min(1).max(120),
  categorie: z.string().max(120).nullable(),
  etat: z.enum(ETATS),
  prix_eur: z.number().positive().max(1_000_000),
  contexte: z.object({
    poids: z.array(Poids).max(100),
    plancher: Entier100.nullable(),
    remise: z.number().min(0).max(100),
    scoreIa: Entier100.nullable(),
    prixTable: z
      .object({ id: z.string().max(40), gravite: GraviteSchema, poids: Poids })
      .nullable(),
    score: Entier100,
  }),
});

export interface ProduitEnregistre {
  produit: ProduitComparable;
  contexte: ContexteScore;
}

export function encoderProduit(produit: ProduitComparable, contexte: ContexteScore): string {
  return JSON.stringify({
    marque: produit.marque.slice(0, 120),
    modele: produit.modele.slice(0, 120),
    categorie: produit.categorie?.slice(0, 120) ?? null,
    etat: produit.etat,
    prix_eur: produit.prixEur,
    contexte,
  } satisfies z.input<typeof EnregistrementSchema>);
}

/** `null` si l'enregistrement est absent, expiré, ou de forme inattendue. */
export function decoderProduit(brut: string | null): ProduitEnregistre | null {
  if (brut === null) return null;
  try {
    const lu = EnregistrementSchema.safeParse(JSON.parse(brut));
    if (!lu.success) return null;
    const { contexte, prix_eur: prixEur, ...reste } = lu.data;
    return { produit: { ...reste, prixEur }, contexte };
  } catch {
    return null;
  }
}
