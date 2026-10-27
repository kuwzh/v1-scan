import { describe, expect, it } from "vitest";
import { normaliserReponse } from "../ai/normaliser";
import { reponseModele } from "../ai/test-utils";
import type { EntreeIa, EvaluerIa } from "../ai/types";
import type { ReponseModele } from "../ai/wire";
import { analyserDemande } from "./pipeline";

const deps = (evaluerIa: EvaluerIa | null) => ({
  evaluerIa,
  maintenant: () => new Date("2026-10-26T10:00:00Z"),
});

/** IA qui rapporte les messages donnés (et rien d'autre), avec le score donné. */
function iaRapportant(
  messages: ReponseModele["donnees_extraites"]["messages"],
  score = 5,
): EvaluerIa {
  return async (entree: EntreeIa) => {
    const r = reponseModele({ score, niveau: score >= 30 ? "moyen" : "faible" });
    r.donnees_extraites.messages = messages;
    const { evaluation, avertissements } = normaliserReponse(r, {
      texteSource: entree.images.length === 0 ? entree.texte : null,
    });
    return {
      ok: true as const,
      evaluation,
      avertissements,
      usage: { entree: 1, sortie: 1, cacheLecture: 0, cacheEcriture: 0 },
      dureeMs: 1,
      modele: "claude-haiku-5-5",
    };
  };
}
const msg = (auteur: "acheteur" | "vendeur" | "inconnu", texte: string) => ({
  auteur,
  confiance: "haute" as const,
  texte,
});

const CONVERSATION = [
  "Moi : Bonjour, la veste est toujours disponible ?",
  "Vendeur : Oui. Mais je préfère un paiement PayPal, c'est plus simple.",
  "Vendeur : On peut aussi continuer sur WhatsApp si tu veux.",
].join("\n");

describe("filet : les règles lisent aussi le texte brut quand l'IA a oublié un message", () => {
  it("l'IA n'a rapporté qu'un message banal : les demandes du vendeur sont quand même vues", async () => {
    const ia = iaRapportant([msg("acheteur", "Bonjour, la veste est toujours disponible ?")]);
    const r = await analyserDemande({ images: [], texte: CONVERSATION, site: "vinted" }, deps(ia));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ids = r.resultat.signaux.map((s) => s.id);
    expect(ids).toContain("paiement.paypal");
    expect(ids).toContain("plateforme.whatsapp");
    expect(r.resultat.meta.mode).toBe("complet");
    expect(r.resultat.score).toBeGreaterThanOrEqual(30);
  });

  it("l'IA n'a rien rapporté du tout", async () => {
    const r = await analyserDemande(
      { images: [], texte: CONVERSATION, site: "vinted" },
      deps(iaRapportant([])),
    );
    expect(r.ok && r.resultat.signaux.map((s) => s.id)).toContain("paiement.paypal");
  });

  it("un signal vu à la fois dans les messages de l'IA et dans le texte brut ne compte qu'une fois", async () => {
    const avecMessages = iaRapportant([
      msg("vendeur", "Oui. Mais je préfère un paiement PayPal, c'est plus simple."),
    ]);
    const sans = iaRapportant([]);
    const a = await analyserDemande(
      { images: [], texte: CONVERSATION, site: "vinted" },
      deps(avecMessages),
    );
    const b = await analyserDemande(
      { images: [], texte: CONVERSATION, site: "vinted" },
      deps(sans),
    );
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.resultat.signaux.filter((s) => s.id === "paiement.paypal")).toHaveLength(1);
    expect(a.resultat.meta.score_regles).toBe(b.resultat.meta.score_regles);
  });
});

describe("filet : la séparation des auteurs est conservée", () => {
  it("une question de l'acheteur, que l'IA a attribuée à l'acheteur, n'est pas lue", async () => {
    const texte =
      "Salut, tu acceptes PayPal ? Ou on parle sur WhatsApp ?\nNon, uniquement via Vinted.";
    const ia = iaRapportant([
      msg("acheteur", "Salut, tu acceptes PayPal ? Ou on parle sur WhatsApp ?"),
      msg("vendeur", "Non, uniquement via Vinted."),
    ]);
    const r = await analyserDemande({ images: [], texte, site: "vinted" }, deps(ia));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ids = r.resultat.signaux.map((s) => s.id);
    expect(ids).not.toContain("paiement.paypal");
    expect(ids).not.toContain("plateforme.whatsapp");
    expect(r.resultat.score).toBeLessThan(30);
  });

  it("les lignes « Moi : » ne sont jamais lues, même si l'IA les a oubliées", async () => {
    const texte =
      "Moi : tu acceptes PayPal ? Sinon WhatsApp.\nVendeur : Non, uniquement via Vinted.";
    const r = await analyserDemande({ images: [], texte, site: "vinted" }, deps(iaRapportant([])));
    expect(r.ok && r.resultat.signaux.map((s) => s.id)).toEqual([]);
  });

  it("une dénégation du vendeur reste une dénégation", async () => {
    const texte = "Vendeur : Je n'accepte pas PayPal, uniquement Vinted.";
    const r = await analyserDemande({ images: [], texte, site: "vinted" }, deps(iaRapportant([])));
    expect(r.ok && r.resultat.signaux.map((s) => s.id)).not.toContain("paiement.paypal");
  });
});
