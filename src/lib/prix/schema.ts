import { z } from "zod";
import type { EstimationPrix } from "../contracts/prix";
import { nettoyerChamp } from "./prompt";

/**
 * Réponse JSON que le modèle écrit après sa recherche. Comme pour l'analyse, aucune union ni
 * nullable : un prix introuvable vaut 0 et la confiance « aucune » le dit. Ce schéma sert à valider
 * le texte du modèle avec zod, et, en cas d'échec seulement, de format de sortie pour l'appel de
 * réparation (sans outil de recherche : les sorties structurées ne sont pas combinées avec
 * `web_search`, dont les citations sont toujours actives). `verifierSchema` le contrôle en test.
 */
export const CONFIANCES_ESTIMATION = ["haute", "moyenne", "basse", "aucune"] as const;

export const ReponseEstimationSchema = z.object({
  article_identifie: z
    .string()
    .describe("Article retenu (marque, modèle, capacité). Chaîne vide si introuvable."),
  prix_neuf_eur: z.number().describe("Prix neuf actuel en France, en euros TTC. 0 si introuvable."),
  occasion_min_eur: z
    .number()
    .describe("Bas de la fourchette des prix d'occasion habituels, en euros. 0 si introuvable."),
  occasion_max_eur: z
    .number()
    .describe("Haut de la fourchette des prix d'occasion habituels, en euros. 0 si introuvable."),
  confiance: z
    .enum(CONFIANCES_ESTIMATION)
    .describe("haute, moyenne, basse ; « aucune » si rien de comparable n'a été trouvé."),
  sources: z
    .array(
      z.object({
        url: z.string().describe("Adresse exacte d'une page trouvée par la recherche."),
        titre: z.string().describe("Titre de la page."),
      }),
    )
    .describe("De 2 à 5 pages réellement trouvées, sur lesquelles s'appuient les prix."),
  remarque: z.string().describe("Une phrase sur les limites de l'estimation, ou une chaîne vide."),
});
export type ReponseEstimation = z.infer<typeof ReponseEstimationSchema>;

export const SCHEMA_ESTIMATION: Record<string, unknown> = (() => {
  const schema = z.toJSONSchema(ReponseEstimationSchema, { reused: "inline" }) as Record<
    string,
    unknown
  >;
  delete schema.$schema;
  return schema;
})();

const PRIX_MAX_EUR = 1_000_000;
const MAX_SOURCES = 5;

/** Un prix plausible, ou `null` : 0 (introuvable), négatif, non fini ou démesuré. */
function prixValide(valeur: number): number | null {
  return Number.isFinite(valeur) && valeur > 0 && valeur <= PRIX_MAX_EUR
    ? Math.round(valeur * 100) / 100
    : null;
}

/**
 * Forme canonique d'une adresse pour comparer deux adresses d'une même page : hôte en minuscules,
 * sans `www.`, sans fragment ni barre finale. `null` si ce n'est pas une adresse https.
 */
export function normaliserUrl(brut: string): string | null {
  try {
    const url = new URL(brut.trim());
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const hote = url.hostname.toLowerCase().replace(/^www\./, "");
    // Une adresse IP ou un nom interne n'est pas une page de marché.
    if (!hote.includes(".") || /^\d+(?:\.\d+){3}$/.test(hote) || hote.includes(":")) return null;
    return `${hote}${url.pathname.replace(/\/+$/, "")}${url.search}`;
  } catch {
    return null;
  }
}

/**
 * Remet l'estimation sous sa forme de contrat (`null` quand c'est introuvable) et la rend sûre :
 * - les sources doivent être des pages https que la recherche a réellement renvoyées
 *   (`urlsTrouvees`) : le modèle ne peut pas en inventer, ni glisser une adresse piégée ;
 * - aucune source retenue (ou fourchette incohérente avec le prix neuf) : confiance « basse », donc
 *   aucun signal de risque ;
 * - une fourchette inversée est remise dans l'ordre.
 * Renvoie `null` si la recherche n'a rien trouvé (confiance « aucune », ou aucun prix exploitable).
 */
export function depuisReponseEstimation(
  api: ReponseEstimation,
  urlsTrouvees: ReadonlySet<string>,
): EstimationPrix | null {
  if (api.confiance === "aucune") return null;

  const neuf = prixValide(api.prix_neuf_eur);
  let min = prixValide(api.occasion_min_eur);
  let max = prixValide(api.occasion_max_eur);
  if (min !== null && max !== null && min > max) [min, max] = [max, min];
  if (min === null || max === null) {
    min = null;
    max = null;
  }
  if (neuf === null && min === null) return null;

  const retenues = new Map<string, { url: string; titre: string }>();
  for (const source of api.sources) {
    const cle = normaliserUrl(source.url);
    if (cle === null || !urlsTrouvees.has(cle) || retenues.has(cle)) continue;
    retenues.set(cle, { url: source.url.trim(), titre: nettoyerChamp(source.titre, 120) });
    if (retenues.size >= MAX_SOURCES) break;
  }

  let confiance: EstimationPrix["confiance"] = api.confiance;
  const remarques: string[] = [];
  if (api.remarque.trim()) remarques.push(nettoyerChamp(api.remarque, 200));
  if (retenues.size === 0) {
    confiance = "basse";
    remarques.push("Aucune source vérifiable n'a été retenue.");
  }
  if (neuf !== null && max !== null && max > neuf * 1.25) {
    confiance = "basse";
    remarques.push("La fourchette d'occasion dépasse le prix neuf : estimation incohérente.");
  }

  return {
    article: nettoyerChamp(api.article_identifie, 120) || "Article",
    prix_neuf_eur: neuf,
    occasion_min_eur: min,
    occasion_max_eur: max,
    confiance,
    sources: [...retenues.values()],
    remarque: remarques.length > 0 ? remarques.join(" ") : null,
  };
}
