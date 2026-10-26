import { z } from "zod";
import { AnalysisResultSchema } from "./result";

/**
 * Pourquoi un résultat est partiel (règles seules alors qu'une lecture par l'IA était
 * attendue). Un lien analysé seul n'est pas « partiel » : l'IA n'a rien à y lire.
 */
export const RAISONS_PARTIELLE = ["forte_affluence", "ia_indisponible"] as const;
export const RaisonPartielleSchema = z.enum(RAISONS_PARTIELLE);
export type RaisonPartielle = z.infer<typeof RaisonPartielleSchema>;

/** Réponse de `POST /api/v1/analyze`. */
export const AnalyzeResponseSchema = z.object({
  /** Identifiant éphémère, à renvoyer avec le vote du feedback. Sans lien avec l'utilisateur. */
  analyse_id: z.uuid(),
  resultat: AnalysisResultSchema,
  partielle: z.object({ raison: RaisonPartielleSchema, message: z.string() }).nullable(),
});
export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;

/** Réponse de `POST /api/v1/feedback`. */
export const FeedbackResponseSchema = z.object({ ok: z.literal(true) });
export type FeedbackResponse = z.infer<typeof FeedbackResponseSchema>;

/** Réponse de `GET /api/v1/stats`. `null` : compteur indisponible, on ne l'affiche pas. */
export const StatsResponseSchema = z.object({ analyses: z.number().int().min(0).nullable() });
export type StatsResponse = z.infer<typeof StatsResponseSchema>;
