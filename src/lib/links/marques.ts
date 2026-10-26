import { compacter } from "./similarite";

export interface Marque {
  id: string;
  /** Nom affiché à l'utilisateur. */
  nom: string;
  /**
   * Formes reconnues dans une adresse, en minuscules sans accents ni tirets
   * (« mondial-relay » est comparé sous la forme « mondialrelay »).
   * Un mot de moins de 5 lettres n'est reconnu que comme mot entier.
   */
  mots: readonly string[];
  /** Domaines officiels (domaines enregistrables). Leurs sous-domaines sont officiels aussi. */
  officiels: readonly string[];
  /**
   * Nom aussi courant comme prénom ou mot usuel : sans mot d'appât à côté, une
   * ressemblance pèse moins lourd.
   */
  ambigu?: boolean;
}

/**
 * Marques les plus souvent imitées dans les arnaques à la seconde main : plateformes,
 * transporteurs, moyens de paiement, banques.
 *
 * Ces données sont à entretenir : un domaine officiel manquant crée un faux positif,
 * un domaine ajouté à tort crée un faux négatif. N'ajouter que des domaines dont on
 * est sûr qu'ils appartiennent à la marque.
 */
export const MARQUES: readonly Marque[] = [
  {
    id: "vinted",
    nom: "Vinted",
    mots: ["vinted"],
    officiels: [
      "vinted.fr",
      "vinted.com",
      "vinted.be",
      "vinted.es",
      "vinted.it",
      "vinted.de",
      "vinted.nl",
      "vinted.pl",
      "vinted.pt",
      "vinted.lu",
      "vinted.at",
      "vinted.co.uk",
      "vinted.cz",
      "vinted.lt",
    ],
  },
  { id: "leboncoin", nom: "Leboncoin", mots: ["leboncoin"], officiels: ["leboncoin.fr"] },
  {
    id: "mondialrelay",
    nom: "Mondial Relay",
    mots: ["mondialrelay"],
    officiels: ["mondialrelay.fr"],
  },
  {
    id: "colissimo",
    nom: "Colissimo",
    mots: ["colissimo"],
    officiels: ["colissimo.fr"],
  },
  {
    id: "laposte",
    nom: "La Poste",
    mots: ["laposte"],
    officiels: ["laposte.fr", "laposte.net", "lapostemobile.fr"],
  },
  { id: "chronopost", nom: "Chronopost", mots: ["chronopost"], officiels: ["chronopost.fr"] },
  {
    id: "dpd",
    nom: "DPD",
    mots: ["dpd"],
    officiels: ["dpd.fr", "dpd.com", "dpd.be", "dpd.nl", "dpd.de", "dpd.co.uk", "dpdgroup.com"],
  },
  { id: "relaiscolis", nom: "Relais Colis", mots: ["relaiscolis"], officiels: ["relaiscolis.com"] },
  {
    id: "paypal",
    nom: "PayPal",
    mots: ["paypal"],
    officiels: ["paypal.com", "paypal.fr", "paypal.me", "paypal-community.com"],
  },
  { id: "lydia", nom: "Lydia", mots: ["lydia"], officiels: ["lydia-app.com"], ambigu: true },
  {
    id: "creditagricole",
    nom: "Crédit Agricole",
    mots: ["creditagricole"],
    officiels: ["credit-agricole.fr"],
  },
  {
    id: "societegenerale",
    nom: "Société Générale",
    mots: ["societegenerale"],
    officiels: ["societegenerale.fr", "societegenerale.com"],
  },
  {
    id: "bnpparibas",
    nom: "BNP Paribas",
    mots: ["bnpparibas"],
    officiels: ["bnpparibas.com", "bnpparibas.fr", "mabanque.bnpparibas"],
  },
  { id: "lcl", nom: "LCL", mots: ["lcl"], officiels: ["lcl.fr"] },
  {
    id: "labanquepostale",
    nom: "La Banque Postale",
    mots: ["labanquepostale"],
    officiels: ["labanquepostale.fr"],
  },
  {
    id: "caisseepargne",
    nom: "Caisse d'Épargne",
    mots: ["caisseepargne", "caissedepargne"],
    officiels: ["caisse-epargne.fr"],
  },
  {
    id: "banquepopulaire",
    nom: "Banque Populaire",
    mots: ["banquepopulaire"],
    officiels: ["banquepopulaire.fr"],
  },
  {
    id: "creditmutuel",
    nom: "Crédit Mutuel",
    mots: ["creditmutuel"],
    officiels: ["creditmutuel.fr"],
  },
  { id: "cic", nom: "CIC", mots: ["cic"], officiels: ["cic.fr"] },
  {
    id: "boursorama",
    nom: "Boursorama",
    mots: ["boursorama", "boursobank"],
    officiels: ["boursorama.com", "boursobank.com"],
  },
  { id: "hellobank", nom: "Hello bank!", mots: ["hellobank"], officiels: ["hellobank.fr"] },
  { id: "fortuneo", nom: "Fortuneo", mots: ["fortuneo"], officiels: ["fortuneo.fr"] },
];

/** Domaine enregistrable officiel → marque. */
export const OFFICIELS: ReadonlyMap<string, Marque> = new Map(
  MARQUES.flatMap((marque) => marque.officiels.map((domaine) => [domaine, marque] as const)),
);

/**
 * Domaines connus et sûrs qui n'ont pas de marque surveillée, ou qui ressemblent à une
 * marque surveillée sans lien avec elle (ex. lacoste.com est à une lettre de laposte).
 * Évite des faux positifs ; à compléter au fil des signalements.
 */
export const DOMAINES_SURS: ReadonlySet<string> = new Set([
  "ups.com",
  "fedex.com",
  "dhl.com",
  "dhl.fr",
  "colisprive.com",
  "amazon.fr",
  "amazon.com",
  "ebay.fr",
  "ebay.com",
  "vestiairecollective.com",
  "lacoste.com",
  "lacoste.fr",
  "minted.com",
]);

/** Formes compactes des marques, calculées une fois. */
export const MARQUES_COMPACTES: ReadonlyMap<string, readonly string[]> = new Map(
  MARQUES.map((m) => [m.id, m.mots.map(compacter)] as const),
);
