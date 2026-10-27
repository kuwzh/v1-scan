import { lireConfigIa } from "../ai/config";
import { normaliserReponse } from "../ai/normaliser";
import { reponseModele } from "../ai/test-utils";
import type { EntreeIa, EvaluerIa, RaisonEchecIa, ResultatIa, UsageIa } from "../ai/types";
import type { ReponseModele } from "../ai/wire";
import { StockageMemoire, lireConfigSecurite } from "../security";
import { creerLecteurCompteur } from "./compteur";
import type { DependancesApi } from "./deps";

export const USAGE_TYPIQUE: UsageIa = {
  entree: 3_000,
  sortie: 800,
  cacheLecture: 0,
  cacheEcriture: 0,
};

export type EvaluateurFactice = EvaluerIa & { appels: EntreeIa[] };

/** Évaluateur qui renvoie la réponse donnée, passée par la vraie normalisation. */
export function evaluateurFactice(
  options: {
    reponse?: ReponseModele;
    usage?: UsageIa;
    echec?: { raison: RaisonEchecIa; usage?: UsageIa };
  } = {},
): EvaluateurFactice {
  const appels: EntreeIa[] = [];
  const evaluer = (async (entree: EntreeIa): Promise<ResultatIa> => {
    appels.push(entree);
    if (options.echec) {
      return {
        ok: false,
        raison: options.echec.raison,
        detail: "HTTP 529",
        dureeMs: 500,
        ...(options.echec.usage ? { usage: options.echec.usage } : {}),
      };
    }
    const { evaluation, avertissements } = normaliserReponse(options.reponse ?? reponseModele(), {
      texteSource: entree.images.length === 0 ? entree.texte : null,
    });
    return {
      ok: true,
      evaluation,
      avertissements,
      usage: options.usage ?? USAGE_TYPIQUE,
      dureeMs: 900,
      modele: "claude-haiku-5-5",
    };
  }) as EvaluateurFactice;
  evaluer.appels = appels;
  return evaluer;
}

export interface ContexteTest {
  deps: DependancesApi;
  stockage: StockageMemoire;
  horloge: { ms: number };
  ia: EvaluateurFactice;
}

export function creerContexteTest(
  options: {
    env?: Record<string, string>;
    ia?: EvaluateurFactice | null;
    stockage?: StockageMemoire;
  } = {},
): ContexteTest {
  const horloge = { ms: Date.UTC(2026, 9, 26, 12, 30) };
  const stockage = options.stockage ?? new StockageMemoire(() => horloge.ms);
  const ia = options.ia === null ? null : (options.ia ?? evaluateurFactice());
  const env = { ANTHROPIC_API_KEY: "sk-test", IP_HASH_SECRET: "secret-de-test", ...options.env };
  const config = lireConfigSecurite(env);
  const deps: DependancesApi = {
    config,
    configIa: lireConfigIa(env),
    stockage,
    evaluateur: ia,
    secretIp: config.ipSecret ?? "secret-de-test",
    maintenant: () => new Date(horloge.ms),
    lireCompteur: creerLecteurCompteur(stockage, config.cacheCompteurS * 1000, () => horloge.ms),
  };
  return { deps, stockage, horloge, ia: ia as EvaluateurFactice };
}

const OCTETS_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82];
export const imagePng = (taille = 200): File => {
  const octets = new Uint8Array(taille);
  octets.set(OCTETS_PNG);
  return new File([octets], "capture.png", { type: "image/png" });
};

export const CONVERSATION_BANALE = [
  "Vendeur : Bonjour, oui il est toujours disponible.",
  "Vendeur : Je l'envoie demain via Vinted, avec le suivi.",
].join("\n");

export const CONVERSATION_SUSPECTE = [
  "Vendeur : Je préfère qu'on continue sur WhatsApp, c'est plus simple.",
  "Vendeur : Paie par virement ou par mandat cash, je t'envoie le colis ensuite.",
].join("\n");

export function requeteAnalyse(
  champs: { texte?: string; lien?: string; images?: File[]; site?: string } = {},
  entetes: Record<string, string> = {},
): Request {
  const form = new FormData();
  if (champs.texte !== undefined) form.append("texte", champs.texte);
  if (champs.lien !== undefined) form.append("lien", champs.lien);
  if (champs.site !== undefined) form.append("site", champs.site);
  for (const f of champs.images ?? []) form.append("images", f);
  return new Request("http://localhost/api/v1/analyze", {
    method: "POST",
    body: form,
    headers: { "x-forwarded-for": "198.51.100.10", ...entetes },
  });
}

export function requeteFeedback(corps: unknown, entetes: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/v1/feedback", {
    method: "POST",
    body: typeof corps === "string" ? corps : JSON.stringify(corps),
    headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.10", ...entetes },
  });
}
