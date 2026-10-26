import { z } from "zod";
import { ExtractedDataSchema } from "./extracted";
import { NiveauSchema, ScoreSchema } from "./niveau";
import { RassurantSchema, SignalSchema } from "./signals";

/**
 * `complet` : règles + IA. `regles_seules` : l'IA a échoué ou n'a pas été appelée
 * (analyse partielle, signalée comme telle à l'utilisateur).
 */
export const ModeAnalyseSchema = z.enum(["complet", "regles_seules"]);
export type ModeAnalyse = z.infer<typeof ModeAnalyseSchema>;

export const AnalysisResultSchema = z.object({
  score: ScoreSchema,
  niveau: NiveauSchema,
  /** Triés du plus grave au moins grave. */
  signaux: z.array(SignalSchema),
  /** Affichés sous « Ce qui rassure ». */
  rassurants: z.array(RassurantSchema),
  conseils: z.array(z.string().min(1)),
  donnees_extraites: ExtractedDataSchema,
  meta: z.object({
    mode: ModeAnalyseSchema,
    score_regles: ScoreSchema,
    /** `null` en mode `regles_seules`. */
    score_ia: ScoreSchema.nullable(),
    /** Plancher imposé par les signaux critiques, `null` s'il n'y en a pas. */
    plancher: ScoreSchema.nullable(),
  }),
});
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
