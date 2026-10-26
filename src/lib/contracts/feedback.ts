import { z } from "zod";
import { ScoreSchema } from "./niveau";

/**
 * Feedback anonyme « Ce résultat était-il juste ? ». Le client n'envoie que le score
 * affiché et le vote : le niveau est déduit côté serveur et le score est réduit à une
 * tranche de 10 points avant tout stockage. Aucun contenu, aucune capture.
 */
export const VOTES = ["up", "down"] as const;
export const VoteSchema = z.enum(VOTES);
export type Vote = z.infer<typeof VoteSchema>;

export const FeedbackInputSchema = z.object({
  score: ScoreSchema,
  vote: VoteSchema,
});
export type FeedbackInput = z.infer<typeof FeedbackInputSchema>;
