import { describe, expect, it } from "vitest";
import { creerMessage, donneesExtraitesVides, type Message } from "../contracts/extracted";
import { analyserLiens } from "../links/analyse";
import { collecterLiensBruts } from "./contexte";
import { evaluerRegles } from "./moteur";

function evaluerMessages(messages: Message[], texte?: string) {
  const donnees = donneesExtraitesVides();
  donnees.plateforme = "vinted";
  donnees.messages = messages;
  const liens = analyserLiens(collecterLiensBruts(donnees, texte));
  return evaluerRegles({ donnees, texte, liens });
}

/** Un échantillon de messages qui lèvent chacun un signal, graves compris. */
const DECLENCHEURS: ReadonlyArray<readonly [signal: string, texte: string]> = [
  ["plateforme.whatsapp", "Écris-moi sur WhatsApp"],
  ["plateforme.telegram", "On continue sur Telegram"],
  ["paiement.virement", "Je te donne mon IBAN pour le virement"],
  ["paiement.paypal_proches", "PayPal entre proches, c'est mieux"],
  ["paiement.mandat_carte_cadeau", "Je n'accepte que le mandat cash"],
  ["paiement.code_sms", "Envoie-moi le code reçu par SMS"],
  ["paiement.coordonnees_bancaires", "Envoie-moi le numéro de ta carte et le cryptogramme"],
  ["script.piece_identite", "Envoie-moi une photo de ta carte d'identité"],
  ["script.trop_percu", "Je t'ai envoyé 50 € de trop, peux-tu me rembourser la différence ?"],
  ["script.frais_supplementaires", "Il faut régler 40 € de frais de douane"],
  ["lien.imitation_marque", "Paie ici : vinted-paiement.com"],
  ["lien.raccourci", "Voici le lien : bit.ly/3xYz"],
];

describe("séparation des auteurs : les règles ne lisent que vendeur et inconnu", () => {
  it.each(DECLENCHEURS)("%s : levé par un message du vendeur", (signal, texte) => {
    expect(evaluerMessages([creerMessage("vendeur", texte)]).signaux.map((s) => s.id)).toContain(
      signal,
    );
  });

  it.each(DECLENCHEURS)("%s : levé par un message d'auteur inconnu", (signal, texte) => {
    expect(evaluerMessages([creerMessage("inconnu", texte)]).signaux.map((s) => s.id)).toContain(
      signal,
    );
  });

  it.each(DECLENCHEURS)("%s : jamais levé par un message de l'acheteur", (_signal, texte) => {
    const r = evaluerMessages([creerMessage("acheteur", texte)]);
    expect(r.signaux).toEqual([]);
    expect(r.score).toBe(0);
    expect(r.plancher).toBeNull();
  });

  it("les liens écrits par l'acheteur ne sont pas analysés", () => {
    const d = donneesExtraitesVides();
    d.messages = [creerMessage("acheteur", "J'ai reçu ça : vinted-paiement.com, c'est normal ?")];
    expect(collecterLiensBruts(d)).toEqual([]);
  });

  it("dans une conversation mêlée, seul ce que dit le vendeur compte", () => {
    const r = evaluerMessages([
      creerMessage("acheteur", "Tu acceptes PayPal ? Je peux aussi faire un virement."),
      creerMessage("vendeur", "Non, uniquement le paiement via Vinted."),
      creerMessage("acheteur", "Ok, on continue sur WhatsApp alors ?"),
      creerMessage("vendeur", "Non non, tout se passe ici."),
    ]);
    expect(r.signaux).toEqual([]);
  });

  it("à contenu égal, l'attribution change le résultat : vendeur → alerte, acheteur → rien", () => {
    const texte = "Je préfère un virement, écris-moi sur WhatsApp";
    const vendeur = evaluerMessages([creerMessage("vendeur", texte)]);
    const acheteur = evaluerMessages([creerMessage("acheteur", texte)]);
    expect(vendeur.score).toBeGreaterThan(50);
    expect(acheteur.score).toBe(0);
  });

  it("un script critique dit par l'acheteur ne lève pas le plancher", () => {
    const r = evaluerMessages([
      creerMessage(
        "acheteur",
        "J'ai déjà payé ! Clique ici pour recevoir l'argent : vinted-paiement.com",
      ),
    ]);
    expect(r.plancher).toBeNull();
  });

  it("le texte brut, lui, est lu comme d'auteur inconnu (utilisé seulement sans extraction)", () => {
    const r = evaluerMessages([], "Écris-moi sur WhatsApp");
    expect(r.signaux.map((s) => s.id)).toContain("plateforme.whatsapp");
  });
});
