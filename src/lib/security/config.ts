/**
 * Valeurs de départ des garde-fous. Toutes se changent par variable d'environnement, sans
 * toucher au code ; une valeur illisible ou hors bornes retombe sur la valeur par défaut.
 */
export const LIMITE_PAR_HEURE_DEFAUT = 10;
export const LIMITE_PAR_JOUR_DEFAUT = 30;
export const PLAFOND_JOURNALIER_USD_DEFAUT = 5;
export const CACHE_COMPTEUR_S_DEFAUT = 300;

export interface ConfigSecurite {
  /** Analyses par IP et par heure. */
  limiteParHeure: number;
  /** Analyses par IP et par jour. */
  limiteParJour: number;
  /** Dépense IA maximale par jour (UTC), tous utilisateurs confondus. 0 coupe l'IA. */
  plafondJournalierUsd: number;
  /** Durée pendant laquelle le compteur public n'est pas relu. */
  cacheCompteurS: number;
  /** Secret servant à hasher les IP. `null` : non configuré. */
  ipSecret: string | null;
  /** Stockage partagé (Upstash Redis). `null` : repli en mémoire, valable en développement. */
  upstash: { url: string; token: string } | null;
  /** Chacune des deux variables Upstash, pour dire laquelle manque. */
  upstashUrlPresente: boolean;
  upstashJetonPresent: boolean;
  production: boolean;
  /** `preview` et `production` ont tous deux NODE_ENV=production : seul VERCEL_ENV les distingue. */
  environnement: "production" | "preview" | "development";
  /**
   * Montrer à l'utilisateur le détail technique de pourquoi l'IA n'a pas été utilisée (variable
   * manquante, code HTTP du fournisseur). Oui partout, sauf `SHOW_DIAGNOSTICS=false` : à mettre
   * avant d'ouvrir l'app au public, pour ne laisser qu'une phrase générale.
   */
  diagnosticDetaille: boolean;
}

type Env = Record<string, string | undefined>;

function nombreBorne(
  brut: string | undefined,
  defaut: number,
  min: number,
  max: number,
  entier: boolean,
): number {
  // `Number("")` vaut 0 : une variable vide doit retomber sur la valeur par défaut, pas sur 0.
  if (brut === undefined || brut.trim() === "") return defaut;
  const n = Number(brut);
  if (!Number.isFinite(n) || n < min || n > max) return defaut;
  return entier && !Number.isInteger(n) ? defaut : n;
}

/** Première variable renseignée parmi `cles` (les variables vides comptent pour absentes). */
function premiere(env: Env, ...cles: string[]): string | undefined {
  for (const cle of cles) {
    const valeur = env[cle]?.trim();
    if (valeur) return valeur;
  }
  return undefined;
}

function diagnosticDetaille(env: Env): boolean {
  return env.SHOW_DIAGNOSTICS?.trim().toLowerCase() !== "false";
}

function environnement(env: Env): ConfigSecurite["environnement"] {
  const v = env.VERCEL_ENV;
  if (v === "production" || v === "preview" || v === "development") return v;
  return env.NODE_ENV === "production" ? "production" : "development";
}

export function lireConfigSecurite(env: Env = process.env): ConfigSecurite {
  // L'intégration Upstash de Vercel peut injecter les noms `KV_REST_API_*` (hérités de Vercel KV)
  // au lieu de `UPSTASH_REDIS_REST_*` : les deux sont acceptés, comme dans le client Upstash.
  // Le jeton en lecture seule (`KV_REST_API_READ_ONLY_TOKEN`) ne convient pas et n'est jamais lu.
  const url = premiere(env, "UPSTASH_REDIS_REST_URL", "KV_REST_API_URL");
  const token = premiere(env, "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_TOKEN");
  return {
    limiteParHeure: nombreBorne(env.RATE_LIMIT_PER_HOUR, LIMITE_PAR_HEURE_DEFAUT, 1, 1_000, true),
    limiteParJour: nombreBorne(env.RATE_LIMIT_PER_DAY, LIMITE_PAR_JOUR_DEFAUT, 1, 10_000, true),
    plafondJournalierUsd: nombreBorne(
      env.DAILY_SPEND_CAP_USD,
      PLAFOND_JOURNALIER_USD_DEFAUT,
      0,
      100_000,
      false,
    ),
    cacheCompteurS: nombreBorne(
      env.COUNTER_CACHE_SECONDS,
      CACHE_COMPTEUR_S_DEFAUT,
      10,
      86_400,
      true,
    ),
    ipSecret: env.IP_HASH_SECRET?.trim() || null,
    upstash: url && token ? { url, token } : null,
    upstashUrlPresente: url !== undefined,
    upstashJetonPresent: token !== undefined,
    production: env.NODE_ENV === "production",
    environnement: environnement(env),
    diagnosticDetaille: diagnosticDetaille(env),
  };
}

export type MotifIaCoupee = "stockage_non_partage" | "secret_manquant";

/**
 * En production, le rate limiting et le plafond de dépense ne valent que s'ils sont
 * partagés entre toutes les instances. Sans Upstash (ou sans secret pour hasher les IP),
 * chaque instance compterait de son côté : l'IA reste alors coupée plutôt que de risquer
 * une facture sans limite. En développement, le repli en mémoire suffit.
 */
export function iaAutorisee(
  config: ConfigSecurite,
): { autorisee: true } | { autorisee: false; motif: MotifIaCoupee } {
  if (!config.production) return { autorisee: true };
  if (!config.upstash) return { autorisee: false, motif: "stockage_non_partage" };
  if (!config.ipSecret) return { autorisee: false, motif: "secret_manquant" };
  return { autorisee: true };
}
