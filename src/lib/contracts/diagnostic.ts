import { z } from "zod";

/**
 * Pourquoi l'analyse par IA n'a pas été utilisée alors qu'elle l'aurait pu : à montrer à
 * l'utilisateur, pour qu'un résultat partiel ne soit jamais silencieux.
 */
export const CODES_DIAGNOSTIC = [
  "ia_non_configuree",
  "stockage_non_partage",
  "secret_manquant",
  "stockage_indisponible",
  "plafond_atteint",
  "ia_echec_indisponible",
  "ia_echec_configuration",
  "ia_echec_delai",
  "ia_echec_refus",
  "ia_echec_tronquee",
  "ia_echec_reponse_invalide",
] as const;
export const CodeDiagnosticSchema = z.enum(CODES_DIAGNOSTIC);
export type CodeDiagnostic = z.infer<typeof CodeDiagnosticSchema>;

export const DiagnosticSchema = z.object({
  code: CodeDiagnosticSchema,
  /**
   * En production : une phrase générale. En preview et en développement : le détail technique
   * (variable manquante, code HTTP du fournisseur d'IA), jamais de contenu utilisateur.
   */
  message: z.string(),
});
export type Diagnostic = z.infer<typeof DiagnosticSchema>;
