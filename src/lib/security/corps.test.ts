import { describe, expect, it } from "vitest";
import { lireFormData, lireJson } from "./corps";

function requete(corps: BodyInit | null, entetes: Record<string, string> = {}): Request {
  return new Request("http://localhost/api", { method: "POST", body: corps, headers: entetes });
}

/** Corps en flux, sans Content-Length : ce que fait un client qui ne le renseigne pas. */
function enFlux(morceaux: Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    pull(controleur) {
      const m = morceaux[i++];
      if (m) controleur.enqueue(m);
      else controleur.close();
    },
  });
}

describe("lireFormData", () => {
  it("lit un formulaire multipart", async () => {
    const form = new FormData();
    form.append("texte", "bonjour");
    form.append("images", new File([new Uint8Array([1, 2, 3])], "a.png"));
    const requeteForm = new Request("http://localhost/api", { method: "POST", body: form });
    const r = await lireFormData(requeteForm, 10_000);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valeur.get("texte")).toBe("bonjour");
    expect((r.valeur.get("images") as File).size).toBe(3);
  });

  it("refuse d'après Content-Length sans lire le corps", async () => {
    const r = new Request("http://localhost/api", {
      method: "POST",
      body: enFlux([new Uint8Array(10)]),
      headers: { "content-length": "999999", "content-type": "multipart/form-data; boundary=x" },
      duplex: "half",
    } as RequestInit);
    expect(await lireFormData(r, 1_000)).toEqual({ ok: false, raison: "trop_gros" });
    expect(r.bodyUsed).toBe(false);
  });

  it("s'arrête dès que la limite est dépassée quand Content-Length est absent ou faux", async () => {
    const gros = new Uint8Array(400);
    const r = new Request("http://localhost/api", {
      method: "POST",
      body: enFlux([gros, gros, gros, gros]),
      headers: { "content-length": "10", "content-type": "multipart/form-data; boundary=x" },
      duplex: "half",
    } as RequestInit);
    expect(await lireFormData(r, 1_000)).toEqual({ ok: false, raison: "trop_gros" });
  });

  it("un corps qui n'est pas du multipart est illisible", async () => {
    const r = requete("pas du multipart", { "content-type": "multipart/form-data; boundary=x" });
    expect(await lireFormData(r, 1_000)).toEqual({ ok: false, raison: "illisible" });
  });
});

describe("lireJson", () => {
  it("lit du JSON", async () => {
    const r = await lireJson(requete(JSON.stringify({ a: 1 })), 1_000);
    expect(r).toEqual({ ok: true, valeur: { a: 1 } });
  });

  it("refuse un JSON trop gros ou illisible", async () => {
    expect(await lireJson(requete("x".repeat(2_000)), 1_000)).toEqual({
      ok: false,
      raison: "trop_gros",
    });
    expect(await lireJson(requete("{pas du json"), 1_000)).toEqual({
      ok: false,
      raison: "illisible",
    });
  });

  it("un corps absent est illisible, pas une erreur", async () => {
    expect(await lireJson(new Request("http://localhost/api", { method: "POST" }), 1_000)).toEqual({
      ok: false,
      raison: "illisible",
    });
  });
});
