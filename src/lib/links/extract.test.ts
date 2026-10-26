import { describe, expect, it } from "vitest";
import { extraireLiens } from "./extract";

describe("extraireLiens", () => {
  it("trouve une adresse nue dans un message", () => {
    expect(extraireLiens("Va sur vinted-paiement.com pour recevoir l'argent !")).toEqual([
      "vinted-paiement.com",
    ]);
  });

  it("trouve un lien complet sans la ponctuation qui le suit", () => {
    expect(extraireLiens("clique ici https://bit.ly/3xYz, merci")).toEqual(["https://bit.ly/3xYz"]);
    expect(extraireLiens("(https://paypal.com/a)")).toEqual(["https://paypal.com/a"]);
    expect(extraireLiens("rdv sur vinted.fr.")).toEqual(["vinted.fr"]);
  });

  it("garde le chemin et les paramètres", () => {
    expect(extraireLiens("www.exemple.com/abc?x=1&y=2.")).toEqual(["www.exemple.com/abc?x=1&y=2"]);
    expect(extraireLiens("livraison-colis.fr/recevoir/ton-argent")).toEqual([
      "livraison-colis.fr/recevoir/ton-argent",
    ]);
  });

  it("lit les liens « défangués »", () => {
    expect(extraireLiens("hxxps://vinted[.]fr/x et mondialrelay-livraison[.]com")).toEqual([
      "https://vinted.fr/x",
      "mondialrelay-livraison.com",
    ]);
  });

  it("extrait en entier un nom écrit avec des lettres d'un autre alphabet", () => {
    // « і » cyrillique dans vіnted : l'adresse ne doit pas être amputée de sa première lettre.
    expect(extraireLiens("Paie ici : vіnted.fr/paiement")).toEqual(["vіnted.fr/paiement"]);
    expect(extraireLiens("rdv sur münchen.de")).toEqual(["münchen.de"]);
  });

  it("ignore les e-mails, les noms de fichiers et les nombres", () => {
    expect(extraireLiens("écris-moi à contact@vinted.fr")).toEqual([]);
    expect(extraireLiens("jean.dupont@gmail.com")).toEqual([]);
    expect(extraireLiens("photo.jpg, image.png, note 3.5 sur 5, v2.0.1")).toEqual([]);
  });

  it("ignore un mot collé à un autre par un point (terminaison inexistante)", () => {
    expect(extraireLiens("Fin de phrase.Ensuite on voit")).toEqual([]);
  });

  it("écarte les doublons, sans tenir compte de la casse", () => {
    expect(extraireLiens("vinted-paiement.com puis Vinted-Paiement.com")).toEqual([
      "vinted-paiement.com",
    ]);
  });

  it("limite le nombre d'adresses", () => {
    const texte = Array.from({ length: 30 }, (_, i) => `site${i}.com`).join(" ");
    expect(extraireLiens(texte)).toHaveLength(20);
    expect(extraireLiens(texte, 5)).toHaveLength(5);
  });

  it("ne renvoie rien pour un texte sans lien", () => {
    expect(extraireLiens("")).toEqual([]);
    expect(extraireLiens("Bonjour, est-ce que l'article est toujours disponible ?")).toEqual([]);
  });
});
