import { describe, expect, it } from "vitest";
import { retirerLignesAcheteur } from "./texte-brut";

const lignes = (...l: string[]) => l.join("\n");

describe("retirerLignesAcheteur", () => {
  it("retire les lignes « Moi : » (casse et espaces indifférents), garde le reste", () => {
    const sortie = retirerLignesAcheteur(
      lignes("Moi : tu acceptes PayPal ?", "  MOI: sinon WhatsApp", "Vendeur : non, via Vinted"),
    );
    expect(sortie).toBe("Vendeur : non, via Vinted");
  });

  it("ne retire pas « Acheteur : » : si l'utilisateur vend, c'est son interlocuteur", () => {
    const texte = "Acheteur : je vous envoie un chèque de 1500 € pour une annonce à 900 €";
    expect(retirerLignesAcheteur(texte)).toBe(texte);
  });

  it("retire les lignes que l'IA a attribuées à l'acheteur, même sans étiquette ni accents", () => {
    const sortie = retirerLignesAcheteur(
      lignes("Tu acceptes PayPal ?", "Non, uniquement via Vinted"),
      ["tu acceptes paypal ?"],
    );
    expect(sortie).toBe("Non, uniquement via Vinted");
  });

  it("retire une ligne qui est un fragment d'un message de l'acheteur sur plusieurs lignes", () => {
    const message = "Bonjour, je suis intéressé par la veste, tu acceptes PayPal ou autre chose ?";
    const sortie = retirerLignesAcheteur(
      lignes(
        "Bonjour, je suis intéressé par la veste,",
        "tu acceptes PayPal ou autre chose ?",
        "Non",
      ),
      [message],
    );
    expect(sortie).toBe("Non");
  });

  it("garde une ligne du vendeur qui contient un message court de l'acheteur", () => {
    const ligne = "Vendeur : oui d'accord, paiement PayPal si tu veux";
    expect(retirerLignesAcheteur(ligne, ["oui d'accord"])).toBe(ligne);
  });

  it("garde une ligne courte qui n'est que le fragment d'un long message (trop ambigu)", () => {
    const sortie = retirerLignesAcheteur("ok\nPayPal", [
      "ok pour moi, je prends et je paie par PayPal",
    ]);
    expect(sortie).toBe("ok\nPayPal");
  });

  it("ignore les messages d'acheteur de moins de 3 caractères (ni « ok » ni un émoji ne retirent rien)", () => {
    expect(retirerLignesAcheteur("ok", ["ok"])).toBe("ok");
    expect(retirerLignesAcheteur("👍\nnon", ["👍"])).toBe("👍\nnon");
  });

  it("gère les fins de ligne Windows et les lignes vides", () => {
    expect(retirerLignesAcheteur("Moi : salut\r\n\r\nVendeur : bonjour")).toBe(
      "\nVendeur : bonjour",
    );
  });

  it("sans message d'acheteur ni étiquette, renvoie le texte tel quel", () => {
    const texte = lignes("a", "", "paiement paypal");
    expect(retirerLignesAcheteur(texte)).toBe(texte);
  });
});
