export const MODELE_PAR_DEFAUT = "claude-haiku-5-5";
export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

export interface ConfigIa {
  /** `null` si la clé n'est pas configurée : le pipeline se rabat alors sur les règles seules. */
  apiKey: string | null;
  model: string;
  effort: Effort;
  timeoutMs: number;
  maxTokens: number;
}

const FORME_MODELE = /^claude-[a-z0-9][a-z0-9.-]{1,60}$/;

function entierBorne(brut: string | undefined, defaut: number, min: number, max: number): number {
  const n = Number(brut);
  return Number.isInteger(n) && n >= min && n <= max ? n : defaut;
}

/**
 * Lit la configuration de l'IA dans l'environnement. Modèle par défaut : Haiku 5.5 (rapide
 * et économique) ; on passe à `claude-sonnet-5-5` en changeant `ANTHROPIC_MODEL`, sans toucher
 * au code. Une valeur invalide retombe sur la valeur par défaut.
 */
export function lireConfigIa(env: Record<string, string | undefined> = process.env): ConfigIa {
  const modele = env.ANTHROPIC_MODEL?.trim();
  const effort = env.ANTHROPIC_EFFORT?.trim() as Effort | undefined;
  return {
    apiKey: env.ANTHROPIC_API_KEY?.trim() || null,
    model: modele && FORME_MODELE.test(modele) ? modele : MODELE_PAR_DEFAUT,
    effort: effort && EFFORTS.includes(effort) ? effort : "low",
    timeoutMs: entierBorne(env.ANTHROPIC_TIMEOUT_MS, 20_000, 3_000, 60_000),
    maxTokens: entierBorne(env.ANTHROPIC_MAX_TOKENS, 6_000, 1_000, 16_000),
  };
}
