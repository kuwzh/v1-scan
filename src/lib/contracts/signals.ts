import { z } from "zod";

/**
 * Gravité d'un signal d'alerte. Volontairement distincte du niveau de risque global
 * (faible / moyen / élevé) pour ne pas les confondre dans l'interface.
 *
 * - `critique` : déclenche un plancher de score. Réservé aux règles déterministes.
 * - `importante`, `attention`, `info` : pèsent de moins en moins dans le score.
 */
export const GRAVITES = ["info", "attention", "importante", "critique"] as const;
export const GraviteSchema = z.enum(GRAVITES);
export type Gravite = z.infer<typeof GraviteSchema>;

/**
 * Gravités que l'IA peut émettre : jamais `critique`. Le plancher de score doit
 * rester auditable et insensible à l'injection de prompt (le texte analysé vient du
 * vendeur), donc seules les règles déterministes peuvent le déclencher.
 */
export const GRAVITES_IA = ["info", "attention", "importante"] as const;
export const GraviteIaSchema = z.enum(GRAVITES_IA);
export type GraviteIa = z.infer<typeof GraviteIaSchema>;

/** Rang croissant : sert à trier les signaux du plus grave au moins grave. */
export function rangGravite(gravite: Gravite): number {
  return GRAVITES.indexOf(gravite);
}

export const SourceSchema = z.enum(["regle", "ia"]);
export type Source = z.infer<typeof SourceSchema>;

/** Signal d'alerte tel qu'affiché à l'utilisateur. */
export const SignalSchema = z.object({
  /** Identifiant stable pour une règle (ex. `paiement.virement`), `ia.<n>` pour l'IA. */
  id: z.string().min(1),
  /** Phrase courte et prudente, sans accusation. */
  label: z.string().min(1),
  gravite: GraviteSchema,
  source: SourceSchema,
});
export type Signal = z.infer<typeof SignalSchema>;

/** Élément rassurant (compte ancien, avis nombreux, paiement via la plateforme…). */
export const RassurantSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  source: SourceSchema,
});
export type Rassurant = z.infer<typeof RassurantSchema>;
