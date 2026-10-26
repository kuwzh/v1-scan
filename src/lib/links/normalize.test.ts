import { describe, expect, it } from "vitest";
import { normaliserLien } from "./normalize";

function ok(brut: string) {
  const r = normaliserLien(brut);
  if (!r.ok) throw new Error(`« ${brut} » devrait être lisible (raison : ${r.raison})`);
  return r;
}

describe("normaliserLien : nettoyage de la forme", () => {
  it.each([
    ["https://www.vinted.fr/items/123", "https://www.vinted.fr/items/123"],
    ["  https://www.vinted.fr/items/123 \n", "https://www.vinted.fr/items/123"],
    ["vinted[.]fr/items/1", "https://vinted.fr/items/1"],
    ["vinted(.)fr", "https://vinted.fr/"],
    ["vinted[dot]fr", "https://vinted.fr/"],
    ["hxxps://vinted[.]fr/x", "https://vinted.fr/x"],
    ["hxxp[:]//vinted[.]fr", "http://vinted.fr/"],
    ["www.vinted.fr", "https://www.vinted.fr/"],
    ["//vinted.fr/x", "https://vinted.fr/x"],
    ["https:/vinted.fr/x", "https://vinted.fr/x"],
    ["https//vinted.fr/x", "https://vinted.fr/x"],
    ["http:vinted.fr", "http://vinted.fr/"],
    ["HTTPS://WWW.VINTED.FR/Items", "https://www.vinted.fr/Items"],
    ["(https://paypal.com/x),", "https://paypal.com/x"],
    ["<https://paypal.com/x>", "https://paypal.com/x"],
    ["« https://paypal.com/x ».", "https://paypal.com/x"],
    ["https://vinted.fr./x", "https://vinted.fr./x"],
  ])("« %s » → %s", (brut, href) => {
    expect(ok(brut).href).toBe(href);
  });

  it("recolle une adresse coupée par l'OCR (espace après un point ou une barre)", () => {
    const r = ok("https://www.vinted. fr/items/1");
    expect(r.href).toBe("https://www.vinted.fr/items/1");
    expect(r.modifications).toContain("espaces_retires");
    expect(ok("https://www.leboncoin.fr/ad/ vetements/123").href).toBe(
      "https://www.leboncoin.fr/ad/vetements/123",
    );
  });

  it("ignore le texte autour de l'adresse", () => {
    const r = ok("Va sur vinted-paiement.com pour payer");
    expect(r.hote).toBe("vinted-paiement.com");
    expect(r.modifications).toContain("texte_autour_ignore");
  });

  it("ne confond pas une fin de phrase avec la suite de l'adresse", () => {
    // « vinted.fr. ensuite » : recoller donnerait « vinted.fr.ensuite », terminaison inexistante.
    expect(ok("vinted.fr. ensuite").hote).toBe("vinted.fr");
  });

  it("retire les caractères invisibles et normalise l'Unicode", () => {
    const invisible = ok("vin​ted.fr/x");
    expect(invisible.hote).toBe("vinted.fr");
    expect(invisible.modifications).toContain("caracteres_invisibles_retires");
    expect(ok("ｖｉｎｔｅｄ.fr").modifications).toContain("unicode_normalise");
  });

  it("consigne ce qu'il a nettoyé", () => {
    expect(ok("https://vinted.fr/x").modifications).toEqual([]);
    expect(ok("vinted[.]fr").modifications).toEqual(
      expect.arrayContaining(["defanging", "schema_ajoute"]),
    );
    expect(ok("https:/vinted.fr").modifications).toContain("schema_repare");
  });
});

describe("normaliserLien : n'altère jamais les lettres d'un domaine", () => {
  it.each([
    "vlnted.fr",
    "1eboncoin.fr",
    "leboncoln.fr/paiement",
    "VlNTED.fr",
    "mondialrelais.fr",
    "paypa1.com",
    "vinted.fr.paiement-securise.com",
    "leboncoin.fr-livraison.xyz",
    "vinted-paiement.com",
  ])("« %s » garde son hôte à l'identique", (brut) => {
    const attendu = brut.split("/")[0]!.toLowerCase();
    expect(ok(brut).hote).toBe(attendu);
  });

  it("ne rapproche pas un domaine suspect d'un domaine officiel", () => {
    expect(ok("https://vlnted.fr/items/1").hote).not.toBe("vinted.fr");
    expect(ok("https://vinted.fr.paiement-securise.com").hote).toBe(
      "vinted.fr.paiement-securise.com",
    );
    expect(ok("https://1eboncoin.fr").hote).toBe("1eboncoin.fr");
  });
});

describe("normaliserLien : structure de l'adresse", () => {
  it("expose l'identifiant placé avant le @", () => {
    const r = ok("https://vinted.fr@evil.com/x");
    expect(r.hote).toBe("evil.com");
    expect(r.identifiant).toBe("vinted.fr");
    expect(ok("https://vinted.fr/x").identifiant).toBeNull();
  });

  it("retire le point final de l'hôte et décode le chemin", () => {
    expect(ok("https://vinted.fr./a%20b?x=%C3%A9").hote).toBe("vinted.fr");
    expect(ok("https://vinted.fr/a%20b?x=%C3%A9").chemin).toBe("/a b?x=é");
  });

  it("garde le port et normalise une IP décimale", () => {
    expect(ok("https://vinted.fr:443/x").hote).toBe("vinted.fr");
    expect(ok("http://2130706433/").hote).toBe("127.0.0.1");
  });

  it("convertit un nom international en punycode", () => {
    expect(ok("https://vіnted.fr/").hote).toBe("xn--vnted-n2e.fr");
  });
});

describe("normaliserLien : refus", () => {
  it.each([
    ["", "vide"],
    ["   ", "vide"],
    ["javascript:alert(1)", "schema_non_supporte"],
    ["ftp://exemple.com/a", "schema_non_supporte"],
    ["mailto:a@b.com", "schema_non_supporte"],
    ["data:text/html,<b>x</b>", "schema_non_supporte"],
    ["bonjour tout le monde", "adresse_invalide"],
    ["localhost", "adresse_invalide"],
    ["https://", "adresse_invalide"],
    ["https://vinted,fr/x", "adresse_invalide"],
    ["https://vinted_fr.com", "adresse_invalide"],
    ["https://-vinted.fr", "adresse_invalide"],
    ["a".repeat(3000), "trop_long"],
  ])("« %s » → %s", (brut, raison) => {
    const r = normaliserLien(brut);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.raison).toBe(raison);
  });
});
