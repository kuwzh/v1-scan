import { describe, expect, it } from "vitest";
import { compacter, distanceEdition, replierConfusables, squelette } from "./similarite";

describe("distanceEdition", () => {
  it.each([
    ["vinted", "vinted", 0],
    ["vinted", "vlnted", 1], // substitution
    ["leboncoin", "leboncoln", 1],
    ["vinted", "vinte", 1], // suppression
    ["vinted", "vinteed", 1], // insertion
    ["vinted", "vinetd", 1], // transposition de deux lettres voisines
    ["mondialrelay", "mondialrelais", 2],
    ["", "abc", 3],
    ["abc", "", 3],
    ["paypal", "vinted", 6],
  ])("%s ↔ %s = %i", (a, b, attendu) => {
    expect(distanceEdition(a, b)).toBe(attendu);
    expect(distanceEdition(b, a)).toBe(attendu);
  });

  it("s'arrête dès que le seuil est dépassé", () => {
    expect(distanceEdition("vinted", "paypal", 1)).toBe(2);
    expect(distanceEdition("vinted", "vintage", 1)).toBeGreaterThan(1);
    expect(distanceEdition("a", "abcdefgh", 2)).toBe(3);
  });
});

describe("squelette", () => {
  it("retire les accents et passe en minuscules", () => {
    expect(squelette("Crédit-Agricole")).toBe("credit-agricole");
    expect(squelette("ÉPARGNE")).toBe("epargne");
  });

  it("ramène les lettres cyrilliques et grecques à leur sosie latin", () => {
    expect(squelette("vіnted")).toBe("vinted"); // і cyrillique
    expect(squelette("раураl")).toBe("paypal"); // р, а, у cyrilliques
    expect(squelette("ρaypal")).toBe("paypal"); // ρ grec
  });
});

describe("replierConfusables", () => {
  it("donne le même repli aux écritures qu'on confond à l'œil ou à l'OCR", () => {
    expect(replierConfusables("vlnted")).toBe(replierConfusables("vinted"));
    expect(replierConfusables("1eboncoin")).toBe(replierConfusables("leboncoin"));
    expect(replierConfusables("paypa1")).toBe(replierConfusables("paypal"));
    expect(replierConfusables("rnondialrelay")).toBe(replierConfusables("mondialrelay"));
    expect(replierConfusables("l0ndres")).toBe(replierConfusables("londres"));
  });

  it("ne confond pas des mots réellement différents", () => {
    expect(replierConfusables("vinted")).not.toBe(replierConfusables("paypal"));
  });
});

describe("compacter", () => {
  it("ne garde que lettres et chiffres", () => {
    expect(compacter("mondial-relay.fr")).toBe("mondialrelayfr");
    expect(compacter("La Poste !")).toBe("laposte");
  });
});
