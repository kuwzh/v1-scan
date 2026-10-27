import type { Diagnostic } from "../contracts/diagnostic";
import type { ApiError, CodeErreur } from "../contracts/errors";
import { fr } from "../copy/fr";

export const STATUT_PAR_CODE: Record<CodeErreur, number> = {
  entree_invalide: 400,
  image_invalide: 400,
  trop_de_requetes: 429,
  plafond_atteint: 503,
  ia_indisponible: 503,
  analyse_impossible: 422,
  lien_non_recuperable: 422,
  vote_impossible: 409,
  comparaison_impossible: 409,
  erreur_interne: 500,
};

/** En-têtes communs : une réponse de l'API ne doit jamais être mise en cache ni réinterprétée. */
const ENTETES_API = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
} as const;

export function reponseJson(
  corps: unknown,
  init: ResponseInit & { statut?: number } = {},
): Response {
  const { statut, headers, ...reste } = init;
  const entetes = new Headers({
    ...ENTETES_API,
    "content-type": "application/json; charset=utf-8",
  });
  new Headers(headers).forEach((valeur, cle) => entetes.set(cle, valeur));
  return new Response(JSON.stringify(corps), { ...reste, status: statut ?? 200, headers: entetes });
}

export function reponseErreur(
  code: CodeErreur,
  options: {
    statut?: number;
    message?: string;
    reessayerDansS?: number;
    diagnostic?: Diagnostic | null;
  } = {},
): Response {
  const corps: ApiError = {
    erreur: {
      code,
      message: options.message ?? fr.erreurs[code],
      ...(options.diagnostic ? { diagnostic: options.diagnostic } : {}),
    },
  };
  return reponseJson(corps, {
    statut: options.statut ?? STATUT_PAR_CODE[code],
    headers:
      options.reessayerDansS !== undefined
        ? { "retry-after": String(Math.ceil(options.reessayerDansS)) }
        : undefined,
  });
}

/** Secondes jusqu'à minuit UTC : le plafond de dépense repart alors à zéro. */
export function secondesJusquaMinuitUtc(maintenant: Date): number {
  const minuit = Date.UTC(
    maintenant.getUTCFullYear(),
    maintenant.getUTCMonth(),
    maintenant.getUTCDate() + 1,
  );
  return Math.max(1, Math.ceil((minuit - maintenant.getTime()) / 1000));
}

/**
 * Les navigateurs indiquent d'où part une requête (`Sec-Fetch-Site`). Une requête déclenchée
 * par un autre site (formulaire caché, script tiers) est refusée : elle ferait payer l'IA à
 * quelqu'un d'autre. Les clients hors navigateur n'envoient pas cet en-tête et restent
 * soumis au rate limiting par IP.
 */
export function requeteInterSites(entetes: Headers): boolean {
  return entetes.get("sec-fetch-site") === "cross-site";
}
