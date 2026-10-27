import { describe, expect, it, vi } from "vitest";
import { fr } from "../copy/fr";
import { envoyerAnalyse, envoyerVote, formaterDelai } from "./api";

const entree = { images: [new Blob([new Uint8Array(10)])], texte: "Bonjour", lien: "" };

const reponseValide = {
  analyse_id: "6f1f3a52-3c1b-4a56-9d5e-0b2c7d9f1a10",
  resultat: { score: 70, niveau: "élevé", signaux: [], rassurants: [], conseils: [] },
  partielle: null,
};

const json = (corps: unknown, statut = 200, entetes: Record<string, string> = {}) =>
  new Response(JSON.stringify(corps), {
    status: statut,
    headers: { "content-type": "application/json", ...entetes },
  });
const erreurApi = (code: string, message = "msg serveur") => ({ erreur: { code, message } });

describe("formaterDelai", () => {
  it.each([
    [10, "moins d'une minute"],
    [59, "moins d'une minute"],
    [60, "1 minute"],
    [61, "2 minutes"],
    [700, "12 minutes"],
    [3_599, "60 minutes"],
    [3_600, "1 heure"],
    [7_300, "3 heures"],
  ])("%i s → %s", (s, attendu) => {
    expect(formaterDelai(s)).toBe(attendu);
  });
});

describe("envoyerAnalyse", () => {
  it("envoie un multipart avec les images, le texte, et seulement les champs remplis", async () => {
    const fetchFactice = vi.fn(async () => json(reponseValide));
    const r = await envoyerAnalyse(entree, { fetch: fetchFactice as unknown as typeof fetch });
    expect(r).toEqual({ ok: true, reponse: reponseValide });
    const [url, init] = fetchFactice.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/analyze");
    expect(init.method).toBe("POST");
    const form = init.body as FormData;
    expect(form.getAll("images")).toHaveLength(1);
    expect(form.get("texte")).toBe("Bonjour");
    expect(form.has("lien")).toBe(false);
    expect(init.headers).toBeUndefined();
  });

  it("n'envoie pas un texte ou un lien qui ne contient que des espaces", async () => {
    const fetchFactice = vi.fn(async () => json(reponseValide));
    await envoyerAnalyse(
      { images: [], texte: "   ", lien: " https://exemple.fr " },
      { fetch: fetchFactice as unknown as typeof fetch },
    );
    const form = (fetchFactice.mock.calls[0] as unknown as [string, RequestInit])[1]
      .body as FormData;
    expect(form.has("texte")).toBe(false);
    expect(form.get("lien")).toBe(" https://exemple.fr ");
  });

  it("reprend le code et le message de l'erreur du serveur", async () => {
    const f = async () => json(erreurApi("analyse_impossible", "Capture illisible"), 422);
    const r = await envoyerAnalyse(entree, { fetch: f as unknown as typeof fetch });
    expect(r).toEqual({
      ok: false,
      erreur: { code: "analyse_impossible", message: "Capture illisible", proposerTexte: true },
    });
  });

  it.each([
    ["ia_indisponible", true],
    ["plafond_atteint", true],
    ["analyse_impossible", true],
    ["entree_invalide", false],
    ["trop_de_requetes", false],
    ["lien_non_recuperable", true],
  ])("%s → proposer de coller le texte : %s", async (code, propose) => {
    const f = async () => json(erreurApi(code), 400);
    const r = await envoyerAnalyse(entree, { fetch: f as unknown as typeof fetch });
    expect(!r.ok && !r.annule && r.erreur.proposerTexte).toBe(propose);
  });

  it("reprend le diagnostic du serveur : pourquoi l'IA n'a pas servi", async () => {
    const corps = {
      erreur: {
        code: "ia_indisponible",
        message: "On ne peut pas lire les captures pour le moment.",
        diagnostic: {
          code: "ia_non_configuree",
          message: "Aucune clé ANTHROPIC_API_KEY n'est définie.",
        },
      },
    };
    const f = async () => json(corps, 503);
    const r = await envoyerAnalyse(entree, { fetch: f as unknown as typeof fetch });
    expect(r).toEqual({
      ok: false,
      erreur: {
        code: "ia_indisponible",
        message: "On ne peut pas lire les captures pour le moment.",
        proposerTexte: true,
        diagnostic: "Aucune clé ANTHROPIC_API_KEY n'est définie.",
      },
    });
  });

  it("un diagnostic de mauvaise forme est ignoré", async () => {
    const f = async () =>
      json({ erreur: { code: "ia_indisponible", message: "x", diagnostic: { message: 42 } } }, 503);
    const r = await envoyerAnalyse(entree, { fetch: f as unknown as typeof fetch });
    expect(!r.ok && !r.annule && r.erreur.diagnostic).toBeUndefined();
  });

  it("envoie le site choisi, et rien quand il n'y en a pas", async () => {
    const fetchFactice = vi.fn(async () => json(reponseValide));
    const f = fetchFactice as unknown as typeof fetch;
    await envoyerAnalyse({ ...entree, site: "leboncoin" }, { fetch: f });
    await envoyerAnalyse(entree, { fetch: f });
    const formes = fetchFactice.mock.calls.map(
      (c) => (c as unknown as [string, RequestInit])[1].body as FormData,
    );
    expect(formes[0]?.get("site")).toBe("leboncoin");
    expect(formes[1]?.has("site")).toBe(false);
  });

  it("une réponse sans la liste d'avis reste acceptée (déploiement en cours de mise à jour)", async () => {
    const f = async () => json(reponseValide);
    const r = await envoyerAnalyse(entree, { fetch: f as unknown as typeof fetch });
    expect(r.ok).toBe(true);
  });

  it("429 : annonce combien de temps attendre quand le serveur l'indique", async () => {
    const f = async () => json(erreurApi("trop_de_requetes"), 429, { "retry-after": "700" });
    const r = await envoyerAnalyse(entree, { fetch: f as unknown as typeof fetch });
    expect(!r.ok && !r.annule && r.erreur.message).toBe(fr.ui.erreur.limite("12 minutes"));
  });

  it("429 sans Retry-After : message du serveur", async () => {
    const f = async () => json(erreurApi("trop_de_requetes", "Réessaie plus tard"), 429);
    const r = await envoyerAnalyse(entree, { fetch: f as unknown as typeof fetch });
    expect(!r.ok && !r.annule && r.erreur.message).toBe("Réessaie plus tard");
  });

  it("une réponse 200 de mauvaise forme n'est pas affichée", async () => {
    for (const corps of [
      null,
      {},
      { analyse_id: "x" },
      { ...reponseValide, resultat: { score: 5 } },
    ]) {
      const f = async () => json(corps);
      const r = await envoyerAnalyse(entree, { fetch: f as unknown as typeof fetch });
      expect(!r.ok && !r.annule && r.erreur.code).toBe("reponse_inattendue");
    }
  });

  it("une erreur sans la forme attendue (page 502 d'un proxy) reste présentable", async () => {
    const f = async () => new Response("<html>Bad gateway</html>", { status: 502 });
    const r = await envoyerAnalyse(entree, { fetch: f as unknown as typeof fetch });
    expect(r).toEqual({
      ok: false,
      erreur: {
        code: "reponse_inattendue",
        message: fr.ui.erreur.inattendue,
        proposerTexte: false,
      },
    });
  });

  it("un code d'erreur inconnu n'est pas repris tel quel", async () => {
    const f = async () => json(erreurApi("code_invente", "<script>"), 400);
    const r = await envoyerAnalyse(entree, { fetch: f as unknown as typeof fetch });
    expect(!r.ok && !r.annule && r.erreur.code).toBe("reponse_inattendue");
  });

  it("coupure réseau", async () => {
    const f = async () => {
      throw new TypeError("Failed to fetch");
    };
    const r = await envoyerAnalyse(entree, { fetch: f as unknown as typeof fetch });
    expect(r).toEqual({
      ok: false,
      erreur: { code: "reseau", message: fr.ui.erreur.reseau, proposerTexte: false },
    });
  });

  it("annulation par l'utilisateur : ce n'est pas une erreur", async () => {
    const controleur = new AbortController();
    const f = (_url: string, init: RequestInit) =>
      new Promise<Response>((_ok, ko) => {
        init.signal?.addEventListener("abort", () => ko(new DOMException("annulé", "AbortError")));
      });
    const promesse = envoyerAnalyse(entree, {
      fetch: f as unknown as typeof fetch,
      signal: controleur.signal,
    });
    controleur.abort();
    expect(await promesse).toEqual({ ok: false, annule: true });
  });

  it("délai dépassé : message dédié", async () => {
    vi.useFakeTimers();
    try {
      const f = (_url: string, init: RequestInit) =>
        new Promise<Response>((_ok, ko) => {
          init.signal?.addEventListener("abort", () => ko(new DOMException("délai", "AbortError")));
        });
      const promesse = envoyerAnalyse(entree, {
        fetch: f as unknown as typeof fetch,
        delaiMs: 5_000,
      });
      await vi.advanceTimersByTimeAsync(5_001);
      const r = await promesse;
      expect(!r.ok && !r.annule && r.erreur.code).toBe("delai_depasse");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("envoyerVote", () => {
  const vote = (statut: number) =>
    vi.fn(async () => new Response("{}", { status: statut })) as unknown as typeof fetch;

  it("200 → ok, avec l'identifiant et le vote en JSON", async () => {
    const f = vote(200);
    expect(await envoyerVote("abc", "up", { fetch: f })).toBe("ok");
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/v1/feedback");
    expect(JSON.parse(init.body as string)).toEqual({ analyse_id: "abc", vote: "up" });
  });

  it("409 (déjà voté ou expiré) → deja", async () => {
    expect(await envoyerVote("abc", "down", { fetch: vote(409) })).toBe("deja");
  });

  it.each([400, 429, 500])("%i → echec", async (statut) => {
    expect(await envoyerVote("abc", "up", { fetch: vote(statut) })).toBe("echec");
  });

  it("coupure réseau → echec", async () => {
    const f = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await envoyerVote("abc", "up", { fetch: f })).toBe("echec");
  });
});
