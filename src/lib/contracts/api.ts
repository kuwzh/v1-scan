import { z } from "zod";
import { CodeDiagnosticSchema, DiagnosticSchema } from "./diagnostic";
import { AnalysisResultSchema } from "./result";

/**
 * Pourquoi un résultat est partiel (règles seules alors qu'une lecture par l'IA était
 * attendue). Un lien analysé seul n'est pas « partiel » : l'IA n'a rien à y lire.
 */
export const RAISONS_PARTIELLE = ["forte_affluence", "ia_indisponible"] as const;
export const RaisonPartielleSchema = z.enum(RAISONS_PARTIELLE);
export type RaisonPartielle = z.infer<typeof RaisonPartielleSchema>;

/** Informations à montrer à côté du résultat, qui ne sont ni une erreur ni un signal. */
export const CODES_AVIS = ["lien_annonce_non_lue"] as const;
export const AvisSchema = z.object({ code: z.enum(CODES_AVIS), message: z.string() });
export type Avis = z.infer<typeof AvisSchema>;

/** Réponse de `POST /api/v1/analyze`. */
export const AnalyzeResponseSchema = z.object({
  /** Identifiant éphémère, à renvoyer avec le vote du feedback. Sans lien avec l'utilisateur. */
  analyse_id: z.uuid(),
  resultat: AnalysisResultSchema,
  partielle: z
    .object({
      raison: RaisonPartielleSchema,
      message: z.string(),
      /** Pourquoi l'IA n'a pas été utilisée ; `null` quand le message suffit (forte affluence). */
      diagnostic: DiagnosticSchema.nullable(),
    })
    .nullable(),
  avis: z.array(AvisSchema),
  /** La comparaison de prix est possible : marque, modèle et prix ont été lus avec une confiance haute. */
  comparaison_prix: z.object({ disponible: z.boolean() }),
});
export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;

/** Réponse de `POST /api/v1/feedback`. */
export const FeedbackResponseSchema = z.object({ ok: z.literal(true) });
export type FeedbackResponse = z.infer<typeof FeedbackResponseSchema>;

/** Réponse de `GET /api/v1/stats`. `null` : compteur indisponible, on ne l'affiche pas. */
export const StatsResponseSchema = z.object({ analyses: z.number().int().min(0).nullable() });
export type StatsResponse = z.infer<typeof StatsResponseSchema>;

/**
 * Réponse de `GET /api/v1/health` : l'état de la configuration, sans jamais aucune valeur secrète
 * (seulement présent / absent, le nom du modèle et les noms des variables qui manquent).
 */
export const HealthResponseSchema = z.object({
  anthropic: z.enum(["present", "absent"]),
  /** `present` : configurée mais injoignable ; `joignable` : une lecture a réussi. */
  upstash: z.enum(["absent", "present", "joignable"]),
  ip_secret: z.enum(["present", "absent"]),
  ia_active: z.boolean(),
  modele: z.string(),
  /** Variables d'environnement qui manquent pour que l'IA soit active. */
  manque: z.array(z.string()),
  /** Pourquoi `ia_active` est faux ; `null` quand elle est active. */
  raison_inactive: CodeDiagnosticSchema.nullable(),
  environnement: z.enum(["production", "preview", "development"]),
  plafond_usd: z.number(),
  /** `null` : stockage injoignable. */
  depense_du_jour_usd: z.number().nullable(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
