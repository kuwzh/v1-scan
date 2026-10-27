import { z } from "zod";
import { PlateformeSchema } from "./extracted";
import { MAX_IMAGES, MAX_TEXT_CHARS, MAX_URL_CHARS } from "./limits";

/** Un champ de formulaire vide arrive en `""` : on le traite comme absent. */
const optionnel = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    schema.optional(),
  );

/**
 * Parties textuelles d'une demande d'analyse. Les images sont validées à part
 * (type réel, taille, nombre) dans `security/`, car ce ne sont pas des chaînes.
 * La syntaxe du lien est vérifiée par le module `links/`.
 */
export const AnalyzeTextInputSchema = z.object({
  texte: optionnel(z.string().trim().max(MAX_TEXT_CHARS)),
  lien: optionnel(z.string().trim().max(MAX_URL_CHARS)),
  /** Site choisi par l'utilisateur. Absent : poids stricts, comme sur Vinted. */
  site: optionnel(PlateformeSchema),
});
export type AnalyzeTextInput = z.infer<typeof AnalyzeTextInputSchema>;

/** Une demande doit contenir au moins une capture, un texte ou un lien. */
export function aUneEntree(input: AnalyzeTextInput, nombreImages: number): boolean {
  return nombreImages > 0 || Boolean(input.texte) || Boolean(input.lien);
}

export function nombreImagesValide(nombreImages: number): boolean {
  return Number.isInteger(nombreImages) && nombreImages >= 0 && nombreImages <= MAX_IMAGES;
}
