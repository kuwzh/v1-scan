import { randomBytes } from "node:crypto";
import { creerClientAnthropic, creerEvaluateurIa } from "../ai/client";
import { lireConfigIa, type ConfigIa } from "../ai/config";
import type { EvaluerIa } from "../ai/types";
import {
  StockageMemoire,
  creerRedis,
  creerStockageUpstash,
  iaAutorisee,
  lireConfigSecurite,
  type ConfigSecurite,
  type Stockage,
} from "../security";
import { creerLecteurCompteur, type LecteurCompteur } from "./compteur";

export interface DependancesApi {
  config: ConfigSecurite;
  configIa: ConfigIa;
  stockage: Stockage;
  /** `null` : pas de clé d'API, on n'utilise que les règles. */
  evaluateur: EvaluerIa | null;
  /** Secret des empreintes d'IP. Éphémère (propre à l'instance) tant qu'aucun n'est configuré. */
  secretIp: string;
  maintenant: () => Date;
  lireCompteur: LecteurCompteur;
}

type Env = Record<string, string | undefined>;

declare global {
  var __gardoStockageMemoire: StockageMemoire | undefined;
}

/** Une seule mémoire par processus, y compris quand le rechargement à chaud recrée les modules. */
function stockageMemoireUnique(): StockageMemoire {
  return (globalThis.__gardoStockageMemoire ??= new StockageMemoire());
}

export function creerDependances(env: Env = process.env): DependancesApi {
  const config = lireConfigSecurite(env);
  const configIa = lireConfigIa(env);
  const stockage = config.upstash
    ? creerStockageUpstash(creerRedis(config.upstash.url, config.upstash.token))
    : stockageMemoireUnique();
  const maintenant = () => new Date();
  return {
    config,
    configIa,
    stockage,
    evaluateur: configIa.apiKey
      ? creerEvaluateurIa(creerClientAnthropic(configIa), configIa)
      : null,
    secretIp: config.ipSecret ?? randomBytes(32).toString("hex"),
    maintenant,
    lireCompteur: creerLecteurCompteur(stockage, config.cacheCompteurS * 1000),
  };
}

let instance: DependancesApi | null = null;

/** Dépendances de production, construites une fois par instance serverless. */
export function dependancesParDefaut(): DependancesApi {
  if (instance) return instance;
  instance = creerDependances();
  const ia = iaAutorisee(instance.config);
  if (instance.evaluateur && !ia.autorisee) {
    // Message de configuration, sans aucun contenu utilisateur.
    console.warn(
      `[gardo] IA désactivée : ${
        ia.motif === "stockage_non_partage"
          ? "UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN manquants"
          : "IP_HASH_SECRET manquant"
      } (rate limiting et plafond de dépense inopérants sans eux).`,
    );
  }
  return instance;
}
