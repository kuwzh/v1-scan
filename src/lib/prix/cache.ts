import { z } from "zod";
import { EstimationPrixSchema, type EstimationPrix } from "../contracts/prix";
import { normaliserTexte } from "../rules/texte";
import type { Stockage } from "../security";

/** Durée de vie d'une estimation en cache, et d'un « introuvable » (pour ne pas refaire une recherche payante qui échoue). */
export const TTL_ESTIMATION_S = 86_400;
export const TTL_INTROUVABLE_S = 7_200;

export const ETATS = ["neuf", "tres_bon", "bon", "satisfaisant", "pour_pieces", "inconnu"] as const;
export type EtatArticle = (typeof ETATS)[number];

/** Libellés donnés à la recherche : des catégories, pour que l'estimation en cache serve à tous. */
export const LIBELLES_ETAT: Readonly<Record<EtatArticle, string>> = {
  neuf: "neuf (avec étiquette ou jamais utilisé)",
  tres_bon: "très bon état (comme neuf)",
  bon: "bon état",
  satisfaisant: "état satisfaisant (traces d'usage)",
  pour_pieces: "pour pièces ou en panne",
  inconnu: "état non précisé",
};

/** Range l'état annoncé (texte libre) dans une catégorie. */
export function categoriserEtat(etat: string | null | undefined): EtatArticle {
  const t = normaliserTexte(etat ?? "");
  if (t.trim() === "") return "inconnu";
  if (/\b(?:pour pieces?|hs|en panne|casse|defectueu\w*|a reparer)\b/.test(t)) return "pour_pieces";
  if (/\bcomme neuf\b|\btres bon etat\b|\bexcellent\b|\bparfait etat\b/.test(t)) return "tres_bon";
  if (/\bneuf\b|\bjamais (?:porte|utilise)\b|\bsous blister\b|\bscelle\b|\betiquette\b/.test(t)) {
    return "neuf";
  }
  if (/\bbon etat\b|\bbon\b/.test(t)) return "bon";
  if (/\bsatisfaisant\b|\betat correct\b|\busage\b|\buse\b|\bcorrect\b/.test(t))
    return "satisfaisant";
  return "inconnu";
}

function lettres(texte: string): string {
  return normaliserTexte(texte)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Clé de cache : (marque, modèle, état). Le texte est réduit à des lettres et des chiffres : une
 * valeur lue sur une capture ne peut pas fabriquer une clé inattendue.
 */
export function cleCachePrix(produit: {
  marque: string;
  modele: string;
  etat: EtatArticle;
}): string {
  return `prix:${lettres(produit.marque)}:${lettres(produit.modele)}:${produit.etat}`;
}

const EnregistrementSchema = z.object({ estimation: EstimationPrixSchema.nullable() });

export type LectureCache = { trouve: false } | { trouve: true; estimation: EstimationPrix | null };

/** Lit une estimation en cache. Un enregistrement illisible ou périmé de forme compte pour absent. */
export async function lireEstimationCache(stockage: Stockage, cle: string): Promise<LectureCache> {
  const brut = await stockage.lireTexte(cle);
  if (brut === null) return { trouve: false };
  try {
    const lu = EnregistrementSchema.safeParse(JSON.parse(brut));
    return lu.success ? { trouve: true, estimation: lu.data.estimation } : { trouve: false };
  } catch {
    return { trouve: false };
  }
}

/**
 * `null` : la recherche n'a rien trouvé de comparable. Il est gardé moins longtemps, comme une
 * estimation de confiance basse : une nouvelle recherche, plus tard, peut mieux faire.
 */
export async function ecrireEstimationCache(
  stockage: Stockage,
  cle: string,
  estimation: EstimationPrix | null,
  ttlS: number = TTL_ESTIMATION_S,
): Promise<void> {
  await stockage.poser(
    cle,
    JSON.stringify({ estimation }),
    estimation === null || estimation.confiance === "basse"
      ? Math.min(ttlS, TTL_INTROUVABLE_S)
      : ttlS,
  );
}
