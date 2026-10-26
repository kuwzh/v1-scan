import { z } from "zod";

/**
 * Feedback anonyme « Ce résultat était-il juste ? ». Le client n'envoie que l'identifiant
 * éphémère de l'analyse et son vote : le score et le niveau sont retrouvés côté serveur
 * (jamais fournis par le client), réduits à une tranche de 10 points avant tout stockage.
 * L'identifiant n'est valable que pour un vote et pour une durée limitée. Aucun contenu,
 * aucune capture.
 */
export const VOTES = ["up", "down"] as const;
export const VoteSchema = z.enum(VOTES);
export type Vote = z.infer<typeof VoteSchema>;

export const FeedbackInputSchema = z.object({
  analyse_id: z.uuid(),
  vote: VoteSchema,
});
export type FeedbackInput = z.infer<typeof FeedbackInputSchema>;
