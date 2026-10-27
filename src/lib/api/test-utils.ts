import { lireConfigIa } from "../ai/config";
import { normaliserReponse } from "../ai/normaliser";
import { reponseModele } from "../ai/test-utils";
import type { EntreeIa, EvaluerIa, RaisonEchecIa, ResultatIa, UsageIa } from "../ai/types";
import type { ReponseModele } from "../ai/wire";
import { lireConfigPrix } from "../prix/config";
import type { EstimerPrix, ResultatEstimation } from "../prix/estimer";
import type { UsageRecherche } from "../ai/tarifs";
import type { EstimationPrix } from "../contracts/prix";
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
    echec?: { raison: RaisonEchecIa; usage?: UsageIa; detail?: string };
  } = {},
): EvaluateurFactice {
  const appels: EntreeIa[] = [];
  const evaluer = (async (entree: EntreeIa): Promise<ResultatIa> => {
    appels.push(entree);
    if (options.echec) {
      return {
        ok: false,
        raison: options.echec.raison,
        detail: options.echec.detail ?? "HTTP 529",
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

export const USAGE_RECHERCHE_TYPIQUE: UsageRecherche = {
  entree: 15_000,
  sortie: 700,
  cacheLecture: 0,
  cacheEcriture: 0,
  recherchesWeb: 2,
};

export type EstimateurFactice = EstimerPrix & {
  appels: Array<Parameters<EstimerPrix>[0]>;
};

/** Estimateur qui renvoie le résultat donné (ou échoue avec la raison donnée) et note ses appels. */
export function estimateurFactice(
  options: {
    estimation?: EstimationPrix | null;
    echec?: {
      raison:
        "delai" | "indisponible" | "configuration" | "reponse_invalide" | "tronquee" | "refus";
      usage?: UsageRecherche;
    };
    usage?: UsageRecherche;
  } = {},
): EstimateurFactice {
  const appels: Array<Parameters<EstimerPrix>[0]> = [];
  const estimer: EstimerPrix = async (article): Promise<ResultatEstimation> => {
    appels.push(article);
    if (options.echec) {
      return {
        ok: false,
        raison: options.echec.raison,
        dureeMs: 800,
        ...(options.echec.usage ? { usage: options.echec.usage } : {}),
      };
    }
    return {
      ok: true,
      estimation: options.estimation === undefined ? ESTIMATION_SAC : options.estimation,
      usage: options.usage ?? USAGE_RECHERCHE_TYPIQUE,
      dureeMs: 12_000,
      modele: "claude-haiku-5-5",
    };
  };
  return Object.assign(estimer, { appels });
}

/** Une estimation « Louis Vuitton Speedy 30 » : neuf 1 800 €, occasion 700–1 100 €. */
export const ESTIMATION_SAC: EstimationPrix = {
  article: "Louis Vuitton Speedy 30 Monogram",
  prix_neuf_eur: 1_800,
  occasion_min_eur: 700,
  occasion_max_eur: 1_100,
  confiance: "haute",
  sources: [
    { url: "https://fr.louisvuitton.com/fra-fr/produits/sac-speedy-30", titre: "Speedy 30" },
    {
      url: "https://www.vestiairecollective.com/women-bags/speedy-30.shtml",
      titre: "Speedy 30 d'occasion",
    },
  ],
  remarque: null,
};

type ConfianceAnnonce = ReponseModele["donnees_extraites"]["confiance"]["annonce"];

/**
 * Réponse du modèle pour l'annonce d'un sac Louis Vuitton : marque, modèle et prix lus avec une
 * confiance haute. Chaque champ se règle pour tester les cas où la comparaison n'est pas proposée.
 */
export function reponseSac(
  options: {
    prix?: number | null;
    marque?: string | null;
    modele?: string | null;
    etat?: string | null;
    confiance?: Partial<Pick<ConfianceAnnonce, "marque" | "modele" | "prix_eur">>;
  } = {},
): ReponseModele {
  const base = reponseModele().donnees_extraites;
  const prix = options.prix === undefined ? 250 : options.prix;
  const marque = options.marque === undefined ? "Louis Vuitton" : options.marque;
  const modele = options.modele === undefined ? "Speedy 30" : options.modele;
  const etat = options.etat === undefined ? "Bon état" : options.etat;
  const conf = options.confiance ?? {};
  return reponseModele({
    donnees_extraites: {
      ...base,
      annonce: {
        ...base.annonce,
        titre: "Sac à main Louis Vuitton Speedy 30",
        prix_eur: prix,
        marque,
        modele,
        categorie: "sac à main",
        etat,
      },
      confiance: {
        ...base.confiance,
        annonce: {
          ...base.confiance.annonce,
          prix_eur: prix === null ? null : (conf.prix_eur ?? "haute"),
          marque: marque === null ? null : (conf.marque ?? "haute"),
          modele: modele === null ? null : (conf.modele ?? "haute"),
          etat: etat === null ? null : "haute",
        },
      },
    },
  });
}

export interface ContexteTest {
  deps: DependancesApi;
  stockage: StockageMemoire;
  horloge: { ms: number };
  ia: EvaluateurFactice;
  prix: EstimateurFactice | null;
}

export function creerContexteTest(
  options: {
    env?: Record<string, string>;
    ia?: EvaluateurFactice | null;
    prix?: EstimateurFactice | null;
    stockage?: StockageMemoire;
  } = {},
): ContexteTest {
  const horloge = { ms: Date.UTC(2026, 9, 26, 12, 30) };
  const stockage = options.stockage ?? new StockageMemoire(() => horloge.ms);
  const ia = options.ia === null ? null : (options.ia ?? evaluateurFactice());
  const prix = options.prix === null ? null : (options.prix ?? estimateurFactice());
  const env = { ANTHROPIC_API_KEY: "sk-test", IP_HASH_SECRET: "secret-de-test", ...options.env };
  const config = lireConfigSecurite(env);
  const configIa = lireConfigIa(env);
  const deps: DependancesApi = {
    config,
    configIa,
    stockage,
    evaluateur: ia,
    configPrix: lireConfigPrix(env, configIa),
    estimerPrix: prix,
    secretIp: config.ipSecret ?? "secret-de-test",
    maintenant: () => new Date(horloge.ms),
    lireCompteur: creerLecteurCompteur(stockage, config.cacheCompteurS * 1000, () => horloge.ms),
  };
  return { deps, stockage, horloge, ia: ia as EvaluateurFactice, prix };
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

export function requetePrix(corps: unknown, entetes: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/v1/prix", {
    method: "POST",
    body: typeof corps === "string" ? corps : JSON.stringify(corps),
    headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.10", ...entetes },
  });
}
