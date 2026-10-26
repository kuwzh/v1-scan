import { domainToUnicode } from "node:url";
import { describe, expect, it } from "vitest";
import { contientPunycode, decoderPunycode, hoteVersUnicode } from "./punycode";

describe("decoderPunycode", () => {
  it("décode des étiquettes connues", () => {
    expect(decoderPunycode("bcher-kva")).toBe("bücher");
    expect(decoderPunycode("80ak6aa92e")).toBe("аррӏе"); // faux « apple » en cyrillique
  });

  it("renvoie null pour une étiquette invalide", () => {
    expect(decoderPunycode("é")).toBeNull();
    expect(decoderPunycode("a!b")).toBeNull();
  });
});

describe("hoteVersUnicode", () => {
  // Node sert d'oracle : on doit retrouver exactement la même chose.
  it.each([
    "xn--80ak6aa92e.com",
    "xn--bcher-kva.example",
    "www.xn--vnted-n2e.fr",
    "xn--mnchen-3ya.de",
    "xn--e1afmkfd.xn--p1ai",
    "vinted.fr",
  ])("%s", (hote) => {
    expect(hoteVersUnicode(hote)).toBe(domainToUnicode(hote));
  });

  it("laisse intacte une étiquette punycode invalide", () => {
    expect(hoteVersUnicode("xn--!!.com")).toBe("xn--!!.com");
  });
});

describe("contientPunycode", () => {
  it("repère les étiquettes xn--", () => {
    expect(contientPunycode("xn--vnted-n2e.fr")).toBe(true);
    expect(contientPunycode("www.vinted.fr")).toBe(false);
    expect(contientPunycode("axn--b.fr")).toBe(false);
  });
});
