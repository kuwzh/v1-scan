import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import {
  classerErreur,
  construireRequete,
  creerClientAnthropic,
  creerEvaluateurIa,
  type ClientIa,
} from "./client";
import { lireConfigIa } from "./config";
import { messageFactice, reponseModele } from "./test-utils";
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
const json = (r = reponseModele()) => JSON.stringify(r);

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
      ...reponseModele(),
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

  it("ne lève jamais d'exception et ne laisse fuiter aucun message d'erreur dans le détail", async () => {
    const r = await en(erreurHttp(429));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(JSON.stringify(r)).not.toContain("confidentiel");
    expect(r.detail).toBe("HTTP 429");
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
