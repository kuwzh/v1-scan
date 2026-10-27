import { EFFORTS, FORME_MODELE, entierBorne, type Effort } from "../ai/config";

/**
 * Réglages de l'estimation de prix, tous modifiables par variable d'environnement. Une valeur
 * illisible ou hors bornes retombe sur la valeur par défaut.
 */
export interface ConfigPrix {
  /** Modèle qui fait la recherche. Par défaut, celui de l'analyse. */
  modele: string;
  effort: Effort;
  /** Nombre maximal de recherches web par estimation (10 $ les 1 000 recherches). */
  maxRecherches: number;
  maxTokens: number;
  /** Durée totale permise à l'estimation (reprises comprises), sous la durée maximale de la fonction. */
  timeoutMs: number;
  /** Comparaisons par IP : la recherche est le poste de dépense le plus cher de l'application. */
  limiteParHeure: number;
  limiteParJour: number;
  /** Durée pendant laquelle une estimation (marque, modèle, état) est gardée. */
  ttlCacheS: number;
}

export function lireConfigPrix(
  env: Record<string, string | undefined>,
  analyse: { model: string },
): ConfigPrix {
  const modele = env.ANTHROPIC_PRICE_MODEL?.trim();
  const effort = env.ANTHROPIC_PRICE_EFFORT?.trim() as Effort | undefined;
  return {
    modele: modele && FORME_MODELE.test(modele) ? modele : analyse.model,
    effort: effort && EFFORTS.includes(effort) ? effort : "medium",
    maxRecherches: entierBorne(env.PRICE_SEARCH_MAX_USES, 3, 1, 6),
    maxTokens: entierBorne(env.PRICE_MAX_TOKENS, 3_000, 1_000, 8_000),
    timeoutMs: entierBorne(env.PRICE_TIMEOUT_MS, 50_000, 10_000, 55_000),
    limiteParHeure: entierBorne(env.PRICE_RATE_LIMIT_PER_HOUR, 5, 1, 100),
    limiteParJour: entierBorne(env.PRICE_RATE_LIMIT_PER_DAY, 15, 1, 1_000),
    ttlCacheS: entierBorne(env.PRICE_CACHE_TTL_S, 86_400, 60, 604_800),
  };
}
