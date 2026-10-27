import Anthropic from "@anthropic-ai/sdk";
import { MAX_IMAGES } from "../contracts/limits";
import type { ConfigIa } from "./config";
import { normaliserReponse } from "./normaliser";
import { PROMPT_SYSTEME, construireMessageUtilisateur } from "./prompt";
import type { EntreeIa, EvaluerIa, RaisonEchecIa, ResultatIa, UsageIa } from "./types";
import { ReponseApiSchema, SCHEMA_REPONSE, depuisReponseApi } from "./wire";

/** Ce dont l'évaluateur a besoin du SDK : un seul appel. Permet de le remplacer dans les tests. */
export interface ClientIa {
  creer(
    params: Anthropic.MessageCreateParamsNonStreaming,
    options?: { timeout?: number },
  ): Promise<Anthropic.Message>;
}

/** Client réel : SDK officiel, un seul nouvel essai sur les erreurs transitoires. */
export function creerClientAnthropic(
  config: Pick<ConfigIa, "apiKey" | "timeoutMs">,
  options: { maxRetries?: number } = {},
): ClientIa {
  if (!config.apiKey) throw new Error("ANTHROPIC_API_KEY manquante.");
  const sdk = new Anthropic({
    apiKey: config.apiKey,
    maxRetries: options.maxRetries ?? 1,
    timeout: config.timeoutMs,
  });
  return { creer: (params, options) => sdk.messages.create(params, options) };
}

// Le schéma est constant : l'API le compile une fois et le met en cache 24 h de son côté.
const FORMAT_SORTIE: Anthropic.JSONOutputFormat = { type: "json_schema", schema: SCHEMA_REPONSE };

function usageDe(message: Anthropic.Message): UsageIa {
  const u = message.usage;
  return {
    entree: u.input_tokens ?? 0,
    sortie: u.output_tokens ?? 0,
    cacheLecture: u.cache_read_input_tokens ?? 0,
    cacheEcriture: u.cache_creation_input_tokens ?? 0,
  };
}

type ErreurApi = InstanceType<typeof Anthropic.APIError>;

const LONGUEUR_MAX_MESSAGE_API = 500;

/**
 * Message d'erreur de l'API, rendu sûr pour un journal ou un écran de diagnostic : sans clé d'API,
 * sans jeton, sans longue suite de données encodées (une image en base64), sur une seule ligne et
 * tronqué. Les erreurs de validation de l'API décrivent la requête (schéma, paramètre refusé), pas
 * le contenu de l'utilisateur.
 */
export function nettoyerMessageApi(message: string): string {
  const propre = message
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, "[clé masquée]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [masqué]")
    .replace(/[A-Za-z0-9+/_-]{60,}={0,2}/g, "[données masquées]")
    .replace(/\s+/g, " ")
    .trim();
  return propre.length > LONGUEUR_MAX_MESSAGE_API
    ? `${propre.slice(0, LONGUEUR_MAX_MESSAGE_API)}…`
    : propre;
}

/** Type et message de l'erreur renvoyée par l'API (`{ type: "error", error: { type, message } }`). */
function corpsErreurApi(erreur: ErreurApi): { type?: string; message?: string } {
  const corps: unknown = erreur.error;
  if (typeof corps === "string") return { message: corps };
  if (typeof corps !== "object" || corps === null) return { type: erreur.type ?? undefined };
  const racine = corps as Record<string, unknown>;
  const interne =
    typeof racine.error === "object" && racine.error !== null
      ? (racine.error as Record<string, unknown>)
      : racine;
  const type = typeof interne.type === "string" ? interne.type : (erreur.type ?? undefined);
  const message = typeof interne.message === "string" ? interne.message : undefined;
  return { type, message };
}

/** « HTTP 400 (invalid_request_error) : <message de l'API> [req_…] » */
function decrireErreurApi(erreur: ErreurApi): string {
  const { type, message } = corpsErreurApi(erreur);
  const statut = erreur.status ? `HTTP ${erreur.status}` : "erreur de l'API";
  return [
    statut,
    type ? ` (${type})` : "",
    message ? ` : ${nettoyerMessageApi(message)}` : "",
    erreur.requestID ? ` [${erreur.requestID}]` : "",
  ].join("");
}

/**
 * Classe l'erreur du SDK. Le détail donne le statut HTTP, le type et le message de l'erreur de
 * l'API (nettoyé : voir `nettoyerMessageApi`) et l'identifiant de requête, pour qu'on sache ce
 * qui est refusé. Jamais un nom de classe (minifié en production) ni le contenu de l'utilisateur.
 */
export function classerErreur(erreur: unknown): { raison: RaisonEchecIa; detail: string } {
  if (erreur instanceof Anthropic.APIConnectionTimeoutError) {
    return { raison: "delai", detail: "délai dépassé" };
  }
  if (erreur instanceof Anthropic.APIConnectionError) {
    return { raison: "indisponible", detail: "connexion impossible" };
  }
  if (erreur instanceof Anthropic.APIError) {
    const configuration =
      erreur instanceof Anthropic.AuthenticationError ||
      erreur instanceof Anthropic.PermissionDeniedError ||
      erreur instanceof Anthropic.NotFoundError ||
      erreur instanceof Anthropic.BadRequestError ||
      erreur instanceof Anthropic.UnprocessableEntityError;
    return {
      raison: configuration ? "configuration" : "indisponible",
      detail: decrireErreurApi(erreur),
    };
  }
  return { raison: "indisponible", detail: "erreur inattendue" };
}

export function construireRequete(
  entree: EntreeIa,
  config: Pick<ConfigIa, "model" | "effort" | "maxTokens">,
): Anthropic.MessageCreateParamsNonStreaming {
  const images: Anthropic.ImageBlockParam[] = entree.images.slice(0, MAX_IMAGES).map((image) => ({
    type: "image",
    source: { type: "base64", media_type: image.mediaType, data: image.base64 },
  }));
  return {
    model: config.model,
    max_tokens: config.maxTokens,
    // Prompt système stable en tête : c'est la partie mise en cache d'une requête à l'autre.
    system: [{ type: "text", text: PROMPT_SYSTEME, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: [...images, { type: "text", text: construireMessageUtilisateur(entree) }],
      },
    ],
    // Pas de `thinking`, de température ni de prefill : selon les modèles, ces paramètres sont
    // refusés. L'effort règle la profondeur de réflexion (« low » par défaut : rapide et peu coûteux).
    output_config: { effort: config.effort, format: FORMAT_SORTIE },
  };
}

function texteDe(message: Anthropic.Message): string | null {
  const bloc = message.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  return bloc ? bloc.text : null;
}

/**
 * Crée l'évaluateur : une fonction qui envoie les captures et le texte à Claude et renvoie des
 * données déjà nettoyées, ou une raison d'échec. Elle ne lève jamais d'exception et ne logge
 * aucun contenu : l'appelant décide quoi faire d'un échec (en général, les règles seules).
 */
export function creerEvaluateurIa(
  client: ClientIa,
  config: Pick<ConfigIa, "model" | "effort" | "maxTokens" | "timeoutMs">,
): EvaluerIa {
  return async (entree: EntreeIa): Promise<ResultatIa> => {
    const debut = Date.now();
    const duree = () => Date.now() - debut;

    let message: Anthropic.Message;
    try {
      message = await client.creer(construireRequete(entree, config), {
        timeout: config.timeoutMs,
      });
    } catch (erreur) {
      const { raison, detail } = classerErreur(erreur);
      return { ok: false, raison, detail, dureeMs: duree() };
    }

    const usage = usageDe(message);
    const echec = (raison: RaisonEchecIa, detail?: string): ResultatIa => ({
      ok: false,
      raison,
      ...(detail ? { detail } : {}),
      dureeMs: duree(),
      usage,
    });

    // On regarde pourquoi le modèle s'est arrêté avant de toucher au JSON.
    if (message.stop_reason === "refusal") {
      return echec("refus", message.stop_details?.category ?? undefined);
    }
    if (message.stop_reason === "max_tokens") return echec("tronquee");

    const texte = texteDe(message);
    if (texte === null) return echec("reponse_invalide", "aucun bloc texte");
    let json: unknown;
    try {
      json = JSON.parse(texte);
    } catch {
      return echec("reponse_invalide", "JSON illisible");
    }
    const valide = ReponseApiSchema.safeParse(json);
    if (!valide.success) {
      // Chemins seulement : un message d'erreur de validation pourrait citer des valeurs.
      const chemins = [...new Set(valide.error.issues.map((i) => i.path.join(".")))].slice(0, 5);
      return echec("reponse_invalide", `champs : ${chemins.join(", ")}`);
    }

    try {
      const { evaluation, avertissements } = normaliserReponse(depuisReponseApi(valide.data), {
        texteSource: entree.images.length === 0 ? entree.texte : null,
      });
      return {
        ok: true,
        evaluation,
        avertissements,
        usage,
        dureeMs: duree(),
        modele: message.model ?? config.model,
      };
    } catch {
      return echec("reponse_invalide", "normalisation impossible");
    }
  };
}
