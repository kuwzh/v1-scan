import { z } from "zod";

export const CODES_ERREUR = [
  "entree_invalide",
  "image_invalide",
  "trop_de_requetes",
  "plafond_atteint",
  "ia_indisponible",
  "analyse_impossible",
  "lien_non_recuperable",
  "vote_impossible",
  "erreur_interne",
] as const;
export const CodeErreurSchema = z.enum(CODES_ERREUR);
export type CodeErreur = z.infer<typeof CodeErreurSchema>;

/** Forme unique des erreurs de l'API : `{ erreur: { code, message } }`. */
export const ApiErrorSchema = z.object({
  erreur: z.object({
    code: CodeErreurSchema,
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
