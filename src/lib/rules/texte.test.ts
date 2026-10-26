import { describe, expect, it } from "vitest";
import { chercher, chercherTous, estNie, normaliserTexte, verbeNie } from "./texte";
import type { Segment } from "./types";

const seg = (brut: string): Segment => ({
  source: "message",
  auteur: "vendeur",
  brut,
  norm: normaliserTexte(brut),
});

/** Le premier « mot » trouvé dans `phrase` est-il nié ? */
function nie(phrase: string, mot: string): boolean {
  const norm = normaliserTexte(phrase);
  const debut = norm.indexOf(mot);
  if (debut < 0) throw new Error(`« ${mot} » absent de « ${phrase} »`);
  return estNie(norm, debut, debut + mot.length);
}

describe("normaliserTexte", () => {
  it("retire accents et majuscules, redresse les apostrophes", () => {
    expect(normaliserTexte("Écris-moi sur WhatsApp, c’est plus simple")).toBe(
      "ecris-moi sur whatsapp, c'est plus simple",
    );
    expect(normaliserTexte("Cœur  à prendre")).toBe("coeur a prendre");
  });
});

describe("estNie", () => {
  it.each([
    ["Pas de virement", "virement"],
    ["Je n'accepte pas les virements", "virements"],
    ["sans virement", "virement"],
    ["jamais de virement", "virement"],
    ["Aucun virement", "virement"],
    ["Je refuse les virements", "virements"],
    ["Pas de PayPal ni de virement", "virement"],
    ["Pas du tout de virement", "virement"],
    ["Je ne donne pas mon WhatsApp", "whatsapp"],
    ["virement non accepté", "virement"],
    ["virement impossible", "virement"],
    ["PayPal n'est pas possible", "paypal"],
  ])("« %s » : « %s » est nié", (phrase, mot) => {
    expect(nie(phrase, mot)).toBe(true);
  });

  it.each([
    ["Pas de souci je fais un virement", "virement"],
    ["Sans problème je fais un virement", "virement"],
    ["Pas de souci, virement ok", "virement"],
    ["Je n'accepte que les virements", "virements"],
    ["Pour éviter les frais je préfère un virement", "virement"],
    ["Paiement par virement uniquement", "virement"],
    ["Non négociable, virement possible", "virement"],
    ["Tu peux me faire un virement", "virement"],
  ])("« %s » : « %s » n'est pas nié", (phrase, mot) => {
    expect(nie(phrase, mot)).toBe(false);
  });

  it("une virgule ou un point coupent la négation", () => {
    expect(nie("Pas de PayPal. Virement ok.", "virement")).toBe(false);
    expect(nie("Aucun souci, virement possible", "virement")).toBe(false);
  });
});

describe("verbeNie", () => {
  it.each([
    ["ne communique jamais ton code", "communique"],
    ["ne communiquez jamais votre code", "communiquez"],
    ["ne donne pas ton code", "donne"],
    ["n'envoie pas ton code", "envoie"],
  ])("« %s » : le verbe est nié", (phrase, verbe) => {
    const norm = normaliserTexte(phrase);
    const d = norm.indexOf(verbe);
    expect(verbeNie(norm, d, d + verbe.length)).toBe(true);
  });

  it.each([
    ["envoie-moi le code", "envoie"],
    ["donne ton code", "donne"],
    ["peux-tu me communiquer le code", "communiquer"],
  ])("« %s » : le verbe n'est pas nié", (phrase, verbe) => {
    const norm = normaliserTexte(phrase);
    const d = norm.indexOf(verbe);
    expect(verbeNie(norm, d, d + verbe.length)).toBe(false);
  });
});

describe("chercher", () => {
  it("ignore les passages niés mais garde les autres du même texte", () => {
    const segments = [seg("Pas de virement. Mais virement instantané possible.")];
    const trouves = chercherTous(segments, /virement/);
    expect(trouves).toHaveLength(1);
    expect(trouves[0]?.debut).toBeGreaterThan(20);
  });

  it("peut ignorer la négation à la demande", () => {
    expect(chercher([seg("Pas de virement")], /virement/)).toBeNull();
    expect(
      chercher([seg("Pas de virement")], /virement/, { ignorerNegation: true }),
    ).not.toBeNull();
  });

  it("accepte un motif sans l'option g", () => {
    expect(chercher([seg("écris sur WhatsApp")], /whatsapp/)?.extrait).toBe("whatsapp");
  });
});
