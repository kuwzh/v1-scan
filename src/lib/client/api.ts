import type { AnalyzeResponse } from "../contracts/api";
import type { CodeErreur } from "../contracts/errors";
import type { Plateforme } from "../contracts/extracted";
import type { Vote } from "../contracts/feedback";
import { fr } from "../copy/fr";

/**
 * Appels à l'API depuis le navigateur. Les fonctions prennent `fetch` en paramètre pour les
 * tests. Ce module n'importe que des types des contrats (pas de zod dans le bundle du client) :
 * la réponse du serveur est vérifiée par un simple contrôle de forme.
 */
export type CodeErreurAffichee = CodeErreur | "reseau" | "delai_depasse" | "reponse_inattendue";

export interface ErreurAffichee {
  code: CodeErreurAffichee;
  message: string;
  /** Proposer de coller le texte à la place : les captures ne peuvent pas être lues pour l'instant. */
  proposerTexte: boolean;
  /** Pourquoi l'IA n'a pas pu servir (variable manquante en preview, phrase générale en production). */
  diagnostic?: string;
}

export type ResultatEnvoi =
  | { ok: true; reponse: AnalyzeResponse }
  | { ok: false; annule: true }
  | { ok: false; annule?: false; erreur: ErreurAffichee };

export interface EntreeEnvoi {
  images: readonly Blob[];
  texte: string;
  lien: string;
  /** Site choisi par l'utilisateur. */
  site?: Plateforme;
}

export interface OptionsEnvoi {
  fetch?: typeof fetch;
  signal?: AbortSignal;
  /** Au-delà, l'appel est abandonné (le serveur coupe l'IA à 20 s par défaut). */
  delaiMs?: number;
}

export const DELAI_CLIENT_MS = 50_000;
const CODES_TEXTE_PROPOSE: ReadonlySet<string> = new Set([
  "ia_indisponible",
  "plafond_atteint",
  "analyse_impossible",
  "lien_non_recuperable",
]);

/** « 45 s » → « moins d'une minute », « 700 s » → « 12 minutes », « 7 300 s » → « 3 heures ». */
export function formaterDelai(secondes: number): string {
  if (secondes < 60) return "moins d'une minute";
  if (secondes < 3_600) {
    const minutes = Math.ceil(secondes / 60);
    return `${minutes} minute${minutes > 1 ? "s" : ""}`;
  }
  const heures = Math.ceil(secondes / 3_600);
  return `${heures} heure${heures > 1 ? "s" : ""}`;
}

function estObjet(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function estReponseAnalyse(v: unknown): v is AnalyzeResponse {
  if (!estObjet(v) || typeof v.analyse_id !== "string") return false;
  const r = v.resultat;
  return (
    estObjet(r) &&
    typeof r.score === "number" &&
    typeof r.niveau === "string" &&
    r.niveau in fr.niveaux &&
    Array.isArray(r.signaux) &&
    Array.isArray(r.rassurants) &&
    Array.isArray(r.conseils) &&
    (v.avis === undefined || Array.isArray(v.avis))
  );
}

function erreur(code: CodeErreurAffichee, message: string, diagnostic?: string): ErreurAffichee {
  return {
    code,
    message,
    proposerTexte: CODES_TEXTE_PROPOSE.has(code),
    ...(diagnostic ? { diagnostic } : {}),
  };
}

function erreurDepuisReponse(corps: unknown, retryAfter: string | null): ErreurAffichee {
  const brute = estObjet(corps) && estObjet(corps.erreur) ? corps.erreur : null;
  const code =
    brute && typeof brute.code === "string" && brute.code in fr.erreurs
      ? (brute.code as CodeErreur)
      : null;
  if (!code) return erreur("reponse_inattendue", fr.ui.erreur.inattendue);
  const delai = Number(retryAfter);
  if (code === "trop_de_requetes" && retryAfter !== null && Number.isFinite(delai) && delai > 0) {
    return erreur(code, fr.ui.erreur.limite(formaterDelai(delai)));
  }
  const message =
    typeof brute?.message === "string" && brute.message ? brute.message : fr.erreurs[code];
  const diagnostic =
    estObjet(brute?.diagnostic) && typeof brute.diagnostic.message === "string"
      ? brute.diagnostic.message
      : undefined;
  return erreur(code, message, diagnostic);
}

/** Pose un délai maximal et relaie l'annulation de l'utilisateur sur un seul signal. */
function signalAvecDelai(signal: AbortSignal | undefined, delaiMs: number) {
  const controleur = new AbortController();
  let delaiDepasse = false;
  const minuteur = setTimeout(() => {
    delaiDepasse = true;
    controleur.abort();
  }, delaiMs);
  const relayer = () => controleur.abort();
  if (signal?.aborted) controleur.abort();
  signal?.addEventListener("abort", relayer, { once: true });
  return {
    signal: controleur.signal,
    delaiDepasse: () => delaiDepasse,
    nettoyer: () => {
      clearTimeout(minuteur);
      signal?.removeEventListener("abort", relayer);
    },
  };
}

export async function envoyerAnalyse(
  entree: EntreeEnvoi,
  options: OptionsEnvoi = {},
): Promise<ResultatEnvoi> {
  const form = new FormData();
  entree.images.forEach((blob, i) => form.append("images", blob, `capture-${i + 1}.jpg`));
  if (entree.texte.trim()) form.append("texte", entree.texte);
  if (entree.lien.trim()) form.append("lien", entree.lien);
  if (entree.site) form.append("site", entree.site);

  const appel = signalAvecDelai(options.signal, options.delaiMs ?? DELAI_CLIENT_MS);
  try {
    const reponse = await (options.fetch ?? fetch)("/api/v1/analyze", {
      method: "POST",
      body: form,
      signal: appel.signal,
    });
    const corps: unknown = await reponse.json().catch(() => null);
    if (reponse.ok) {
      return estReponseAnalyse(corps)
        ? { ok: true, reponse: corps }
        : { ok: false, erreur: erreur("reponse_inattendue", fr.ui.erreur.inattendue) };
    }
    return {
      ok: false,
      erreur: erreurDepuisReponse(corps, reponse.headers.get("retry-after")),
    };
  } catch {
    if (appel.delaiDepasse()) {
      return { ok: false, erreur: erreur("delai_depasse", fr.ui.erreur.delai) };
    }
    if (options.signal?.aborted) return { ok: false, annule: true };
    return { ok: false, erreur: erreur("reseau", fr.ui.erreur.reseau) };
  } finally {
    appel.nettoyer();
  }
}

/** `deja` : ce vote existe déjà (ou l'analyse a expiré) ; pour l'utilisateur, c'est un merci aussi. */
export type ResultatVote = "ok" | "deja" | "echec";

export async function envoyerVote(
  analyseId: string,
  vote: Vote,
  options: Pick<OptionsEnvoi, "fetch"> = {},
): Promise<ResultatVote> {
  try {
    const reponse = await (options.fetch ?? fetch)("/api/v1/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ analyse_id: analyseId, vote }),
    });
    if (reponse.ok) return "ok";
    return reponse.status === 409 ? "deja" : "echec";
  } catch {
    return "echec";
  }
}
