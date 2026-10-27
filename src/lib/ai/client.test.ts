import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import {
  classerErreur,
  nettoyerMessageApi,
  construireRequete,
  creerClientAnthropic,
  creerEvaluateurIa,
  type ClientIa,
} from "./client";
import { lireConfigIa } from "./config";
import { messageFactice, reponseModele, versReponseApi } from "./test-utils";
import { SCHEMA_REPONSE } from "./wire";

const config = {
  model: "claude-haiku-5-5",
  effort: "low" as const,
  maxTokens: 6_000,
  timeoutMs: 15_000,
};
const entree = { images: [], texte: "Bonjour, il est toujours dispo ?", aujourdhui: "2026-10-26" };

function clientRepondant(
  message: ReturnType<typeof messageFactice>,
): ClientIa & { appels: unknown[] } {
  const appels: unknown[] = [];
  return {
    appels,
    creer: async (params, options) => {
      appels.push({ params, options });
      return message;
    },
  };
}
const clientEnErreur = (erreur: unknown): ClientIa => ({
  creer: async () => {
    throw erreur;
  },
});
/** Ce que le modèle renvoie : la forme demandée à l'API (sans `null`). */
const json = (r = reponseModele()) => JSON.stringify(versReponseApi(r));

describe("construireRequete", () => {
  const image = (n: string) => ({ mediaType: "image/png" as const, base64: n });

  it("met les captures avant le texte, dans l'ordre", () => {
    const params = construireRequete({ ...entree, images: [image("AAAA"), image("BBBB")] }, config);
    const contenu = params.messages[0]?.content as Array<{
      type: string;
      source?: { data: string };
    }>;
    expect(contenu.map((b) => b.type)).toEqual(["image", "image", "text"]);
    expect(contenu[0]?.source?.data).toBe("AAAA");
    expect(contenu[1]?.source?.data).toBe("BBBB");
  });

  it("met le prompt système en cache et le sort du message utilisateur", () => {
    const params = construireRequete(entree, config);
    const system = params.system as Array<{ type: string; cache_control?: { type: string } }>;
    expect(system[0]?.cache_control).toEqual({ type: "ephemeral" });
    expect(JSON.stringify(params.messages)).toContain("2026-10-26");
    expect(JSON.stringify(params.system)).not.toContain("2026-10-26");
  });

  it("demande une sortie structurée avec le schéma, l'effort configuré et le modèle configuré", () => {
    const params = construireRequete(entree, {
      ...config,
      model: "claude-sonnet-5-5",
      effort: "medium",
    });
    expect(params.model).toBe("claude-sonnet-5-5");
    expect(params.max_tokens).toBe(6_000);
    expect(params.output_config?.effort).toBe("medium");
    expect(params.output_config?.format).toEqual({ type: "json_schema", schema: SCHEMA_REPONSE });
  });

  it("n'envoie ni thinking, ni température, ni prefill (refusés selon les modèles)", () => {
    const params = construireRequete(entree, config) as unknown as Record<string, unknown>;
    expect(params).not.toHaveProperty("thinking");
    expect(params).not.toHaveProperty("temperature");
    expect(params).not.toHaveProperty("top_p");
    expect(params).not.toHaveProperty("top_k");
    expect(params).not.toHaveProperty("tool_choice");
    const roles = (params.messages as Array<{ role: string }>).map((m) => m.role);
    expect(roles).toEqual(["user"]);
  });

  it("ne dépasse pas le nombre d'images autorisé", () => {
    const params = construireRequete(
      { ...entree, images: Array.from({ length: 6 }, (_, i) => image(String(i))) },
      config,
    );
    const contenu = params.messages[0]?.content as Array<{ type: string }>;
    expect(contenu.filter((b) => b.type === "image")).toHaveLength(3);
  });
});

describe("creerEvaluateurIa : réponse exploitable", () => {
  it("renvoie l'évaluation nettoyée, l'usage, la durée et le modèle", async () => {
    const client = clientRepondant(
      messageFactice({
        texte: json(),
        usage: { input_tokens: 1500, output_tokens: 700, cache_read_input_tokens: 900 },
      }),
    );
    const r = await creerEvaluateurIa(client, config)(entree);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.evaluation.score).toBe(8);
    expect(r.usage).toEqual({ entree: 1500, sortie: 700, cacheLecture: 900, cacheEcriture: 0 });
    expect(r.modele).toBe("claude-haiku-5-5");
    expect(r.dureeMs).toBeGreaterThanOrEqual(0);
  });

  it("transmet le délai à l'appel", async () => {
    const client = clientRepondant(messageFactice({ texte: json() }));
    await creerEvaluateurIa(client, config)(entree);
    expect((client.appels[0] as { options: unknown }).options).toEqual({ timeout: 15_000 });
  });

  it("écarte un message inventé quand l'entrée est du texte collé sans capture", async () => {
    const r = reponseModele();
    r.donnees_extraites.messages = [
      { auteur: "acheteur", confiance: "haute", texte: "Bonjour, il est toujours dispo ?" },
      {
        auteur: "vendeur",
        confiance: "haute",
        texte: "Écris-moi sur WhatsApp, je préfère un virement",
      },
    ];
    const res = await creerEvaluateurIa(
      clientRepondant(messageFactice({ texte: json(r) })),
      config,
    )(entree);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.evaluation.donnees_extraites.messages).toHaveLength(1);
    expect(res.avertissements.messagesEcartes).toBe(1);
  });

  it("ne vérifie pas l'ancrage quand il y a des captures", async () => {
    const r = reponseModele();
    r.donnees_extraites.messages = [
      { auteur: "vendeur", confiance: "haute", texte: "Un message lu sur la capture" },
    ];
    const res = await creerEvaluateurIa(
      clientRepondant(messageFactice({ texte: json(r) })),
      config,
    )({
      ...entree,
      images: [{ mediaType: "image/png", base64: "AAAA" }],
    });
    expect(res.ok && res.evaluation.donnees_extraites.messages).toHaveLength(1);
  });
});

describe("creerEvaluateurIa : échecs de la réponse", () => {
  const echec = async (message: ReturnType<typeof messageFactice>) =>
    creerEvaluateurIa(clientRepondant(message), config)(entree);

  it("refus du modèle", async () => {
    const r = await echec(
      messageFactice({ stop_reason: "refusal", categorieRefus: "cyber", texte: "Je ne peux pas." }),
    );
    expect(r).toMatchObject({ ok: false, raison: "refus", detail: "cyber" });
  });

  it("réponse coupée : on ne tente pas de lire un JSON incomplet", async () => {
    const r = await echec(
      messageFactice({ stop_reason: "max_tokens", texte: json().slice(0, 200) }),
    );
    expect(r).toMatchObject({ ok: false, raison: "tronquee" });
  });

  it("aucun bloc de texte", async () => {
    expect(await echec(messageFactice({ texte: null }))).toMatchObject({
      ok: false,
      raison: "reponse_invalide",
    });
  });

  it("JSON illisible", async () => {
    expect(await echec(messageFactice({ texte: "voici ma réponse : {" }))).toMatchObject({
      ok: false,
      raison: "reponse_invalide",
      detail: "JSON illisible",
    });
  });

  it("JSON de la mauvaise forme : le détail liste des chemins, pas des valeurs", async () => {
    const mauvais = {
      ...versReponseApi(reponseModele()),
      score: "très élevé",
      secret: "contenu-utilisateur-confidentiel",
    };
    const r = await echec(messageFactice({ texte: JSON.stringify(mauvais) }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.raison).toBe("reponse_invalide");
    expect(r.detail).toContain("score");
    expect(JSON.stringify(r)).not.toContain("confidentiel");
    expect(JSON.stringify(r)).not.toContain("très élevé");
  });

  it("une gravité « critique » venue de l'IA rend la réponse invalide (jamais prise pour un plancher)", async () => {
    const r = reponseModele({ signaux: [{ label: "Un signal", gravite: "critique" as never }] });
    expect(await echec(messageFactice({ texte: json(r) }))).toMatchObject({
      ok: false,
      raison: "reponse_invalide",
    });
  });

  it("l'usage est renvoyé même en cas d'échec : il a été facturé", async () => {
    const r = await echec(
      messageFactice({ stop_reason: "max_tokens", usage: { output_tokens: 6000 } }),
    );
    expect(r.ok === false && r.usage?.sortie).toBe(6000);
  });
});

describe("creerEvaluateurIa : erreurs de l'API", () => {
  const en = async (erreur: unknown) => creerEvaluateurIa(clientEnErreur(erreur), config)(entree);
  const erreurHttp = (statut: number) =>
    Anthropic.APIError.generate(
      statut,
      { type: "error", error: { type: "x", message: "contenu-utilisateur-confidentiel" } },
      "contenu-utilisateur-confidentiel",
      new Headers(),
    );

  it.each([
    [429, "indisponible"],
    [500, "indisponible"],
    [529, "indisponible"],
    [401, "configuration"],
    [403, "configuration"],
    [404, "configuration"],
    [400, "configuration"],
  ])("HTTP %i → %s", async (statut, raison) => {
    expect(await en(erreurHttp(statut))).toMatchObject({ ok: false, raison });
  });

  it("délai dépassé", async () => {
    expect(await en(new Anthropic.APIConnectionTimeoutError())).toMatchObject({
      ok: false,
      raison: "delai",
    });
  });

  it("coupure réseau et erreur inattendue → indisponible", async () => {
    expect(await en(new Anthropic.APIConnectionError({ message: "réseau" }))).toMatchObject({
      raison: "indisponible",
    });
    expect(await en(new TypeError("boum"))).toMatchObject({
      raison: "indisponible",
      detail: "erreur inattendue",
    });
    expect(await en("une chaîne jetée")).toMatchObject({ raison: "indisponible" });
  });

  it("ne lève jamais d'exception ; le détail donne le statut, le type et le message de l'API", async () => {
    const r = await en(erreurHttp(429));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.detail).toBe("HTTP 429 (x) : contenu-utilisateur-confidentiel");
  });

  it("ne logge rien", async () => {
    const espions = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    await en(erreurHttp(500));
    await creerEvaluateurIa(clientRepondant(messageFactice({ texte: json() })), config)(entree);
    for (const e of espions) expect(e).not.toHaveBeenCalled();
    espions.forEach((e) => e.mockRestore());
  });
});

describe("classerErreur", () => {
  it("classe le délai avant la coupure réseau (c'en est une sous-classe)", () => {
    expect(classerErreur(new Anthropic.APIConnectionTimeoutError()).raison).toBe("delai");
    expect(classerErreur(new Anthropic.APIConnectionError({ message: "x" })).raison).toBe(
      "indisponible",
    );
  });
});

describe("creerClientAnthropic", () => {
  it("refuse de se créer sans clé : on se rabat alors sur les règles", () => {
    expect(() => creerClientAnthropic(lireConfigIa({}))).toThrow(/ANTHROPIC_API_KEY/);
    expect(() =>
      creerClientAnthropic(lireConfigIa({ ANTHROPIC_API_KEY: "sk-test" })),
    ).not.toThrow();
  });
});

describe("erreur de l'API : le corps exact est restitué, nettoyé", () => {
  const erreur = (statut: number, corps: unknown, requete = "req_011CVabc123") =>
    Anthropic.APIError.generate(
      statut,
      corps as Record<string, unknown>,
      undefined,
      new Headers({ "request-id": requete }),
    );
  const corpsApi = (type: string, message: string) => ({
    type: "error",
    error: { type, message },
    request_id: "req_corps",
  });

  it("HTTP 400 : statut, type, message et identifiant de requête", () => {
    const r = classerErreur(
      erreur(
        400,
        corpsApi(
          "invalid_request_error",
          "output_config.format.schema: too many parameters with union types (25 > 16)",
        ),
      ),
    );
    expect(r.raison).toBe("configuration");
    expect(r.detail).toBe(
      "HTTP 400 (invalid_request_error) : output_config.format.schema: too many parameters with union types (25 > 16) [req_011CVabc123]",
    );
  });

  it("le message d'une erreur de schéma trop complexe est lisible tel quel", () => {
    const r = classerErreur(
      erreur(400, corpsApi("invalid_request_error", "Schema is too complex for compilation.")),
    );
    expect(r.detail).toContain("Schema is too complex for compilation.");
  });

  it("erreur 5xx et 429 : même format, raison « indisponible »", () => {
    const r = classerErreur(erreur(529, corpsApi("overloaded_error", "Overloaded")));
    expect(r).toEqual({
      raison: "indisponible",
      detail: "HTTP 529 (overloaded_error) : Overloaded [req_011CVabc123]",
    });
  });

  it("sans identifiant de requête : pas de crochets", () => {
    const e = Anthropic.APIError.generate(
      401,
      corpsApi("authentication_error", "invalid x-api-key"),
      undefined,
      new Headers(),
    );
    expect(classerErreur(e).detail).toBe("HTTP 401 (authentication_error) : invalid x-api-key");
  });

  it("corps absent, texte brut ou de forme inattendue : jamais d'exception", () => {
    expect(classerErreur(erreur(502, undefined)).detail).toBe("HTTP 502 [req_011CVabc123]");
    expect(classerErreur(erreur(500, "<html>Bad gateway</html>")).detail).toContain(
      "<html>Bad gateway</html>",
    );
    expect(classerErreur(erreur(400, { error: "pas un objet" })).detail).toContain("HTTP 400");
    expect(classerErreur(erreur(400, { error: { message: 42 } })).detail).toContain("HTTP 400");
    expect(classerErreur(erreur(400, { type: "error", error: null })).detail).toContain("HTTP 400");
  });

  it("une clé d'API éventuellement citée par le message est masquée", () => {
    const cle = "sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
    const r = classerErreur(
      erreur(401, corpsApi("authentication_error", `invalid x-api-key: ${cle}`)),
    );
    expect(r.detail).not.toContain(cle);
    expect(r.detail).not.toContain("AbCdEf");
    expect(r.detail).toContain("[clé masquée]");
  });

  it("une longue suite de données encodées (image en base64) est masquée", () => {
    const base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk".repeat(10);
    const r = classerErreur(
      erreur(400, corpsApi("invalid_request_error", `image data: ${base64} is invalid`)),
    );
    expect(r.detail).not.toContain("iVBORw0KGgo");
    expect(r.detail).toContain("[données masquées]");
    expect(r.detail).toContain("is invalid");
  });

  it("le message est tronqué et tient sur une ligne", () => {
    const long = `ligne un\n\n  ligne deux ${"mot ".repeat(400)}`;
    const r = classerErreur(erreur(400, corpsApi("invalid_request_error", long)));
    expect(r.detail).not.toContain("\n");
    expect(r.detail.length).toBeLessThan(600);
    expect(r.detail).toContain("…");
  });

  it("une panne réseau ou un délai n'ont pas de corps à citer", () => {
    expect(classerErreur(new Anthropic.APIConnectionTimeoutError()).detail).toBe("délai dépassé");
    expect(classerErreur(new Anthropic.APIConnectionError({ message: "x" })).detail).toBe(
      "connexion impossible",
    );
  });
});

describe("nettoyerMessageApi", () => {
  it("masque les clés, les jetons Bearer et les longues données encodées", () => {
    const sortie = nettoyerMessageApi(
      "clé sk-ant-api03-ABCDEFGH12345678 et Bearer abc.def-ghi_jkl ; données " + "A".repeat(80),
    );
    expect(sortie).toBe("clé [clé masquée] et Bearer [masqué] ; données [données masquées]");
  });

  it("laisse intacts les messages de validation ordinaires", () => {
    const message =
      "messages.0.content.1.image.source.base64.media_type: Input should be 'image/jpeg', 'image/png', 'image/gif' or 'image/webp'";
    expect(nettoyerMessageApi(message)).toBe(message);
  });
});

describe("construireRequete : les images", () => {
  const entreeImages = {
    images: [
      { mediaType: "image/jpeg" as const, base64: "/9j/4AAQSkZJRgABAQ==" },
      { mediaType: "image/png" as const, base64: "iVBORw0KGgoAAAANSUhEUg==" },
      { mediaType: "image/webp" as const, base64: "UklGRiQAAABXRUJQVlA4IBgAAAAw" },
    ],
    texte: "Bonjour",
    aujourdhui: "2026-10-27",
  };
  const blocs = () =>
    construireRequete(entreeImages, config).messages[0]?.content as Array<{
      type: string;
      source?: { type: string; media_type: string; data: string };
    }>;

  it("chaque image est un bloc {type: image, source: {type: base64, media_type, data}} aux noms exacts de l'API", () => {
    const images = blocs().filter((b) => b.type === "image");
    expect(images).toHaveLength(3);
    for (const [i, b] of images.entries()) {
      expect(Object.keys(b).sort()).toEqual(["source", "type"]);
      expect(Object.keys(b.source ?? {}).sort()).toEqual(["data", "media_type", "type"]);
      expect(b.source?.type).toBe("base64");
      expect(b.source?.media_type).toBe(entreeImages.images[i]?.mediaType);
      expect(b.source?.data).toBe(entreeImages.images[i]?.base64);
    }
  });

  it("n'emploie que les types d'image que l'API accepte (jpeg, png, gif, webp)", () => {
    const acceptes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
    for (const b of blocs().filter((x) => x.type === "image")) {
      expect(acceptes.has(b.source?.media_type ?? "")).toBe(true);
    }
  });

  it("les données sont du base64 pur : sans préfixe data:, sans saut de ligne ni espace", () => {
    for (const b of blocs().filter((x) => x.type === "image")) {
      expect(b.source?.data).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
      expect(b.source?.data).not.toContain("data:");
    }
  });

  it("les images précèdent le texte, qui est le dernier bloc", () => {
    const types = blocs().map((b) => b.type);
    expect(types).toEqual(["image", "image", "image", "text"]);
  });
});
