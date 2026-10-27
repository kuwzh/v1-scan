import type { HealthResponse } from "../contracts/api";
import type { CodeDiagnostic } from "../contracts/diagnostic";
import { iaAutorisee, lireDepenseDuJour, type ConfigSecurite, type Stockage } from "../security";
import type { DependancesApi } from "./deps";
import { reponseJson } from "./reponses";

/**
 * Variables d'environnement qui manquent pour que l'IA soit active. En production (y compris les
 * previews), le stockage partagé et le secret des IP sont obligatoires ; en développement, seule
 * la clé Anthropic l'est.
 */
export function variablesManquantes(
  config: ConfigSecurite,
  options: { anthropic: boolean },
): string[] {
  const manquantes: string[] = [];
  if (!options.anthropic) manquantes.push("ANTHROPIC_API_KEY");
  if (config.production) {
    if (!config.upstashUrlPresente) manquantes.push("UPSTASH_REDIS_REST_URL (ou KV_REST_API_URL)");
    if (!config.upstashJetonPresent)
      manquantes.push("UPSTASH_REDIS_REST_TOKEN (ou KV_REST_API_TOKEN)");
    if (!config.ipSecret) manquantes.push("IP_HASH_SECRET");
  }
  return manquantes;
}

const DELAI_PING_MS = 3_000;
const DUREE_CACHE_MS = 30_000;

/** Une lecture d'une clé qui n'existe pas : prouve que le stockage répond, sans rien écrire. */
async function stockageRepond(stockage: Stockage): Promise<boolean> {
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      stockage.lire("sante:ping"),
      new Promise((_, refuser) => {
        minuteur = setTimeout(() => refuser(new Error("délai")), DELAI_PING_MS);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(minuteur);
  }
}

export async function calculerSante(deps: DependancesApi): Promise<HealthResponse> {
  const { config } = deps;
  const anthropic = deps.evaluateur !== null;
  const upstash: HealthResponse["upstash"] = !config.upstash
    ? "absent"
    : (await stockageRepond(deps.stockage))
      ? "joignable"
      : "present";
  // Sans Upstash, le repli en mémoire ne vaut qu'hors production (voir `iaAutorisee`).
  const stockageUtilisable = config.upstash ? upstash === "joignable" : !config.production;

  let depense: number | null = null;
  if (stockageUtilisable) {
    try {
      depense = await lireDepenseDuJour(deps.stockage, deps.maintenant());
    } catch {
      depense = null;
    }
  }

  const autorisation = iaAutorisee(config);
  let raison: CodeDiagnostic | null = null;
  if (!anthropic) raison = "ia_non_configuree";
  else if (!autorisation.autorisee) raison = autorisation.motif;
  else if (!stockageUtilisable) raison = "stockage_indisponible";
  else if (
    config.plafondJournalierUsd <= 0 ||
    (depense !== null && depense >= config.plafondJournalierUsd)
  ) {
    raison = "plafond_atteint";
  }

  return {
    anthropic: anthropic ? "present" : "absent",
    upstash,
    ip_secret: config.ipSecret ? "present" : "absent",
    ia_active: raison === null,
    modele: deps.configIa.model,
    manque: variablesManquantes(config, { anthropic }),
    raison_inactive: raison,
    environnement: config.environnement,
    plafond_usd: config.plafondJournalierUsd,
    depense_du_jour_usd: depense === null ? null : Math.round(depense * 1e6) / 1e6,
  };
}

const memoire = new WeakMap<DependancesApi, { le: number; sante: HealthResponse }>();

/**
 * `GET /api/v1/health`. Le résultat est gardé 30 secondes par instance : la route est publique et
 * chaque calcul touche le stockage, on ne veut pas qu'elle serve à consommer le quota d'Upstash.
 */
export async function traiterSante(deps: DependancesApi): Promise<Response> {
  const maintenant = deps.maintenant().getTime();
  const enMemoire = memoire.get(deps);
  if (enMemoire && maintenant - enMemoire.le < DUREE_CACHE_MS) return reponseJson(enMemoire.sante);
  const sante = await calculerSante(deps);
  memoire.set(deps, { le: maintenant, sante });
  return reponseJson(sante);
}
