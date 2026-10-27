import type Anthropic from "@anthropic-ai/sdk";
import type { ClientIa } from "../ai/client";
import type { EstimationPrix } from "../contracts/prix";
import { lireConfigPrix, type ConfigPrix } from "./config";
import type { ReponseEstimation } from "./schema";

export const CONFIG_PRIX: ConfigPrix = lireConfigPrix({}, { model: "claude-haiku-5-5" });

export const ARTICLE = {
  marque: "Louis Vuitton",
  modele: "Speedy 30",
  categorie: "sac à main",
  etat: "bon" as const,
};

export const URL_BRAND = "https://fr.louisvuitton.com/fra-fr/produits/sac-speedy-30";
export const URL_VESTIAIRE = "https://www.vestiairecollective.com/women-bags/speedy-30.shtml";
export const URL_VINTED = "https://www.vinted.fr/catalog?search_text=speedy+30";

export const REPONSE_VALIDE: ReponseEstimation = {
  article_identifie: "Louis Vuitton Speedy 30 Monogram",
  prix_neuf_eur: 1_800,
  occasion_min_eur: 700,
  occasion_max_eur: 1_100,
  confiance: "haute",
  sources: [
    { url: URL_BRAND, titre: "Speedy 30 - Louis Vuitton" },
    { url: URL_VESTIAIRE, titre: "Speedy 30 d'occasion - Vestiaire Collective" },
  ],
  remarque: "",
};

export interface OptionsMessage {
  /** Texte final du modèle (le plus souvent le JSON). */
  texte?: string;
  /** Adresses renvoyées par la recherche. */
  urls?: string[];
  recherches?: number;
  stop_reason?: Anthropic.Message["stop_reason"];
  usage?: Partial<Anthropic.Usage>;
  categorieRefus?: string;
  erreurRecherche?: string;
  /** Faux : aucune phrase avant les recherches (le modèle n'écrit que le JSON final). */
  narration?: boolean;
}

/** Une réponse de l'API avec recherche web : texte, requête de recherche, résultats, texte final. */
export function messageRecherche(options: OptionsMessage = {}): Anthropic.Message {
  const urls = options.urls ?? [URL_BRAND, URL_VESTIAIRE, URL_VINTED];
  const recherches = options.recherches ?? 2;
  const content: unknown[] =
    options.narration === false ? [] : [{ type: "text", text: "Je cherche les prix. " }];
  for (let i = 0; i < recherches; i++) {
    content.push({
      type: "server_tool_use",
      id: `srvtoolu_${i}`,
      name: "web_search",
      input: { query: `speedy 30 prix ${i}` },
    });
    content.push({
      type: "web_search_tool_result",
      tool_use_id: `srvtoolu_${i}`,
      caller: { type: "direct" },
      content: options.erreurRecherche
        ? { type: "web_search_tool_result_error", error_code: options.erreurRecherche }
        : urls.map((url) => ({
            type: "web_search_result",
            url,
            title: `Page ${url}`,
            encrypted_content: "chiffre",
            page_age: null,
          })),
    });
  }
  if (options.texte !== undefined) content.push({ type: "text", text: options.texte });
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-haiku-5-5",
    content,
    stop_reason: options.stop_reason ?? "end_turn",
    stop_sequence: null,
    stop_details: options.categorieRefus
      ? { type: "refusal", category: options.categorieRefus, explanation: null }
      : null,
    usage: {
      input_tokens: 12_000,
      output_tokens: 600,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      server_tool_use: { web_search_requests: recherches, web_fetch_requests: 0 },
      ...options.usage,
    },
  } as unknown as Anthropic.Message;
}

export const json = (r: Partial<ReponseEstimation> = {}) =>
  JSON.stringify({ ...REPONSE_VALIDE, ...r });

/** Client factice : renvoie les réponses données dans l'ordre (ou lève l'erreur), et garde les requêtes. */
export function clientScripte(
  ...reponses: Array<Anthropic.Message | Error>
): ClientIa & { requetes: Anthropic.MessageCreateParamsNonStreaming[] } {
  const requetes: Anthropic.MessageCreateParamsNonStreaming[] = [];
  let i = 0;
  return {
    requetes,
    creer: async (params) => {
      // Copie : l'appelant réutilise et complète le tableau de messages d'un tour à l'autre.
      requetes.push(structuredClone(params));
      const suivante = reponses[Math.min(i++, reponses.length - 1)];
      if (suivante === undefined) throw new Error("aucune réponse prévue");
      if (suivante instanceof Error) throw suivante;
      return suivante;
    },
  };
}

export const estimationValide = (partiel: Partial<EstimationPrix> = {}): EstimationPrix => ({
  article: "Louis Vuitton Speedy 30 Monogram",
  prix_neuf_eur: 1_800,
  occasion_min_eur: 700,
  occasion_max_eur: 1_100,
  confiance: "haute",
  sources: [
    { url: URL_BRAND, titre: "Speedy 30 - Louis Vuitton" },
    { url: URL_VESTIAIRE, titre: "Speedy 30 d'occasion - Vestiaire Collective" },
  ],
  remarque: null,
  ...partiel,
});
