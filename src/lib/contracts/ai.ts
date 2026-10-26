import { z } from "zod";
import { ExtractedDataSchema } from "./extracted";
import { GraviteIaSchema } from "./signals";
import { NiveauSchema, ScoreSchema } from "./niveau";

/**
 * JSON strict renvoyé par le modèle. `donnees_extraites` vient en premier pour que le
 * modèle raisonne à partir de ce qu'il a lu avant d'évaluer.
 *
 * Le `niveau` est exigé mais ignoré à l'usage : on le recalcule depuis le score
 * (voir `niveauPourScore`).
 */
export const AiSignalSchema = z.object({
  label: z.string().min(1),
  gravite: GraviteIaSchema,
});

export const AiRassurantSchema = z.object({
  label: z.string().min(1),
});

export const AiEvaluationSchema = z.object({
  donnees_extraites: ExtractedDataSchema,
  /**
   * `false` quand ce qui a été envoyé n'est ni une annonce, ni un profil, ni une conversation,
   * ou qu'il est illisible : il n'y a alors rien à évaluer.
   */
  contenu_exploitable: z.boolean(),
  score: ScoreSchema,
  niveau: NiveauSchema,
  signaux: z.array(AiSignalSchema),
  rassurants: z.array(AiRassurantSchema),
  conseils: z.array(z.string().min(1)),
});
export type AiEvaluation = z.infer<typeof AiEvaluationSchema>;
