import { z } from "zod";
import { NiveauSchema, ScoreSchema } from "./niveau";
import { SignalSchema } from "./signals";

/**
 * Comparaison du prix d'une annonce à ceux du marché (neuf et occasion), estimés par une recherche
 * en ligne. Ce sont des ESTIMATIONS : elles servent à repérer un prix inhabituel, pas à le prouver.
 */
export const CONFIANCES_PRIX = ["haute", "moyenne", "basse"] as const;
export const ConfiancePrixSchema = z.enum(CONFIANCES_PRIX);

export const SourcePrixSchema = z.object({
  /** Adresse https d'une page réellement trouvée par la recherche. */
  url: z.url(),
  titre: z.string(),
});

export const EstimationPrixSchema = z.object({
  /** Article retenu par la recherche (marque, modèle, capacité…). */
  article: z.string(),
  prix_neuf_eur: z.number().positive().nullable(),
  /** Fourchette des prix d'occasion habituels ; `null` si la recherche n'a pas trouvé assez de prix. */
  occasion_min_eur: z.number().positive().nullable(),
  occasion_max_eur: z.number().positive().nullable(),
  confiance: ConfiancePrixSchema,
  sources: z.array(SourcePrixSchema).max(6),
  /** Limite de l'estimation, en une phrase (modèle ambigu, peu d'annonces comparables…). */
  remarque: z.string().nullable(),
});
export type EstimationPrix = z.infer<typeof EstimationPrixSchema>;

export const ComparaisonPrixSchema = z.object({
  prix_annonce_eur: z.number().nonnegative(),
  /** Milieu de la fourchette d'occasion : le « prix d'occasion habituel ». */
  occasion_habituelle_eur: z.number().positive(),
  /** Écart du prix de l'annonce au prix d'occasion habituel, en % (négatif : moins cher). */
  ecart_pct: z.number().int(),
  /** Prix de l'annonce en % du bas de la fourchette d'occasion : c'est ce que les seuils lisent. */
  part_du_bas_pct: z.number().int().nonnegative(),
  /** Faux si l'estimation est trop peu sûre pour en tirer un signal. */
  fiable: z.boolean(),
});
export type ComparaisonPrix = z.infer<typeof ComparaisonPrixSchema>;

/** Demande de comparaison : l'identifiant de l'analyse, rien d'autre (le produit est retrouvé côté serveur). */
export const PrixInputSchema = z.object({ analyse_id: z.uuid() });
export type PrixInput = z.infer<typeof PrixInputSchema>;

/** Réponse de `POST /api/v1/prix`. */
export const PrixResponseSchema = z.object({
  /** `introuvable` : la recherche n'a pas trouvé assez de prix pour comparer. */
  statut: z.enum(["ok", "introuvable"]),
  estimation: EstimationPrixSchema.nullable(),
  comparaison: ComparaisonPrixSchema.nullable(),
  /** Signal de risque tiré du prix ; jamais « critique ». */
  signal: SignalSchema.nullable(),
  /** Ce que la comparaison change au résultat affiché. */
  resultat: z.object({
    score: ScoreSchema,
    niveau: NiveauSchema,
    /** Signaux à retirer de la liste (le signal de la table de prix, remplacé par celui-ci). */
    signaux_retires: z.array(z.string()),
  }),
  depuis_cache: z.boolean(),
});
export type PrixResponse = z.infer<typeof PrixResponseSchema>;
