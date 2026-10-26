import {
  completerConfiance,
  creerMessage,
  donneesExtraitesVides,
  type ExtractedData,
  type Plateforme,
} from "../../contracts/extracted";
import type { Niveau } from "../../contracts/niveau";

type Annonce = ExtractedData["annonce"];
type Vendeur = ExtractedData["vendeur"];
type Auteur = "vendeur" | "acheteur" | "inconnu";

/**
 * Conversation ou annonce d'exemple, avec ce que le moteur de règles doit en dire.
 * Les textes sont fictifs. Les « sains » servent à repérer les faux positifs, les
 * « suspects » à vérifier que les signaux attendus sont bien levés.
 */
export interface CasConversation {
  nom: string;
  plateforme?: Plateforme;
  annonce?: Partial<Annonce>;
  vendeur?: Partial<Vendeur>;
  messages?: ReadonlyArray<readonly [auteur: Auteur, texte: string]>;
  /** Texte brut collé tel quel (sans IA). */
  texte?: string;
  /** Liens lus à l'écran par l'IA. */
  liens?: string[];
  attendu: {
    /** Niveau en « règles seules » (fusion sans IA, remise comprise). */
    niveau: Niveau;
    presents?: string[];
    absents?: string[];
    /** Un signal critique impose un plancher. */
    critique?: boolean;
    /** Identifiants de rassurants attendus. */
    rassurants?: string[];
  };
}

export function donneesDepuisCas(cas: CasConversation): ExtractedData {
  const donnees = donneesExtraitesVides();
  donnees.plateforme = cas.plateforme ?? null;
  Object.assign(donnees.annonce, cas.annonce);
  Object.assign(donnees.vendeur, cas.vendeur);
  donnees.messages = (cas.messages ?? []).map(([auteur, texte]) => creerMessage(auteur, texte));
  donnees.liens = cas.liens ?? [];
  // Données de test : toutes sûres (confiance « haute »).
  return completerConfiance(donnees, "haute");
}

export const CAS_SAINS: readonly CasConversation[] = [
  {
    nom: "Vinted : profil solide, paiement par la plateforme",
    plateforme: "vinted",
    annonce: { titre: "Robe Zara", marque: "Zara", prix_eur: 15, nombre_photos: 4 },
    vendeur: {
      anciennete_jours: 900,
      nombre_avis: 120,
      note_sur_5: 4.9,
      profil_verifie: true,
      nombre_annonces: 30,
    },
    messages: [
      ["acheteur", "Bonjour, elle est toujours dispo ?"],
      [
        "vendeur",
        "Oui toujours dispo ! Je l'envoie demain via Vinted, le paiement se fait par Vinted.",
      ],
    ],
    attendu: {
      niveau: "faible",
      absents: ["plateforme.whatsapp", "paiement.virement"],
      rassurants: [
        "profil.compte_ancien",
        "profil.nombreux_avis",
        "profil.verifie",
        "plateforme.paiement",
      ],
    },
  },
  {
    nom: "Vinted : le vendeur écarte lui-même les paiements hors plateforme (négations)",
    plateforme: "vinted",
    annonce: { titre: "Baskets", prix_eur: 20 },
    vendeur: { anciennete_jours: 400, nombre_avis: 15, note_sur_5: 4.8 },
    messages: [
      [
        "vendeur",
        "Pas de virement ni de PayPal, uniquement le paiement via Vinted. Je ne donne pas mon WhatsApp, tout passe par la messagerie.",
      ],
    ],
    attendu: {
      niveau: "faible",
      absents: ["paiement.virement", "paiement.paypal", "plateforme.whatsapp"],
      rassurants: ["plateforme.paiement"],
    },
  },
  {
    nom: "Leboncoin : remise en main propre, numéro donné",
    plateforme: "leboncoin",
    annonce: { titre: "Vélo enfant", prix_eur: 60 },
    messages: [
      [
        "vendeur",
        "Bonjour, oui dispo. Je suis à Lyon 3e, on peut se voir samedi. Mon numéro : 06 12 34 56 78",
      ],
    ],
    attendu: {
      niveau: "faible",
      presents: ["plateforme.telephone"],
      absents: ["paiement.virement"],
    },
  },
  {
    nom: "Leboncoin : espèces ou virement à la remise",
    plateforme: "leboncoin",
    annonce: { titre: "Table basse", prix_eur: 80 },
    messages: [["vendeur", "Paiement en espèces à la remise ou virement instantané."]],
    attendu: { niveau: "faible", presents: ["paiement.virement"] },
  },
  {
    nom: "Vinted : conseil de sécurité (« ne communique jamais ton code »)",
    plateforme: "vinted",
    annonce: { titre: "Pull", prix_eur: 12 },
    messages: [
      [
        "vendeur",
        "Attention aux arnaques : ne communique jamais le code reçu par SMS et ne clique jamais sur un lien suspect.",
      ],
      [
        "vendeur",
        "Ne communiquez jamais à qui que ce soit votre code reçu par SMS, même si on se dit de la plateforme.",
      ],
    ],
    attendu: { niveau: "faible", absents: ["paiement.code_sms"] },
  },
  {
    nom: "Vinted : suivi de colis sur le site officiel du transporteur",
    plateforme: "vinted",
    annonce: { titre: "Manteau", prix_eur: 35 },
    messages: [
      [
        "vendeur",
        "Colis envoyé ! Voici le suivi : https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition=12345678",
      ],
    ],
    attendu: { niveau: "faible", absents: ["script.faux_transporteur", "liens.externe"] },
  },
  {
    nom: "Vinted : sac de luxe à un prix cohérent",
    plateforme: "vinted",
    annonce: {
      titre: "Sac Louis Vuitton Speedy 30",
      marque: "Louis Vuitton",
      prix_eur: 480,
      nombre_photos: 6,
    },
    vendeur: { anciennete_jours: 500, nombre_avis: 40, note_sur_5: 4.9 },
    attendu: { niveau: "faible", absents: ["prix.tres_bas", "prix.bas"] },
  },
  {
    nom: "Vinted : coque d'iPhone (accessoire, prix bas normal)",
    plateforme: "vinted",
    annonce: { titre: "Coque iPhone 15 Pro", marque: "Apple", prix_eur: 5 },
    attendu: { niveau: "faible", absents: ["prix.tres_bas", "prix.bas"] },
  },
  {
    nom: "Vinted : iPhone hors service vendu pour pièces",
    plateforme: "vinted",
    annonce: {
      titre: "iPhone 12 HS pour pièces",
      description: "Écran cassé, ne s'allume plus.",
      prix_eur: 30,
    },
    attendu: { niveau: "faible", absents: ["prix.tres_bas", "prix.bas"] },
  },
  {
    nom: "Vinted : compte tout neuf sans avis, annonce banale",
    plateforme: "vinted",
    annonce: { titre: "Pull en laine", prix_eur: 10, nombre_photos: 3 },
    vendeur: { anciennete_jours: 20, nombre_avis: 0, nombre_annonces: 3 },
    messages: [["vendeur", "Bonjour, oui il est dispo."]],
    attendu: {
      niveau: "moyen",
      presents: ["profil.compte_recent", "profil.aucun_avis"],
      critique: false,
    },
  },
  {
    nom: "Vinted : « dernier prix, c'est urgent » (une seule famille de formules)",
    plateforme: "vinted",
    annonce: { titre: "Veste", prix_eur: 25 },
    messages: [["vendeur", "Dernier prix, c'est urgent."]],
    attendu: { niveau: "faible", presents: ["urgence.legere"], absents: ["urgence.forte"] },
  },
  {
    nom: "Vinted : c'est l'acheteur qui évoque le virement (ignoré)",
    plateforme: "vinted",
    annonce: { titre: "Sac", prix_eur: 40 },
    messages: [
      ["acheteur", "Je peux payer par virement ? Envoie-moi ton IBAN."],
      ["vendeur", "Non, uniquement via Vinted."],
    ],
    attendu: { niveau: "faible", absents: ["paiement.virement"] },
  },
  {
    nom: "Vinted : « paiement sécurisé » mentionné sans lien ni demande suspecte",
    plateforme: "vinted",
    annonce: { titre: "Écharpe", prix_eur: 18 },
    messages: [
      [
        "vendeur",
        "Le paiement sécurisé Vinted protège l'acheteur, tu peux payer en toute confiance.",
      ],
    ],
    attendu: { niveau: "faible", absents: ["script.paiement_securise_faux"] },
  },
  {
    nom: "Marketplace : numéro donné pour la remise en main propre",
    plateforme: "facebook_marketplace",
    annonce: { titre: "Bureau", prix_eur: 50 },
    messages: [["vendeur", "Dispo ! Appelle-moi au 07 98 76 54 32 pour qu'on s'organise."]],
    attendu: { niveau: "faible", presents: ["plateforme.telephone"] },
  },
  {
    nom: "Annonce de carte cadeau : le mot « carte cadeau » n'est pas une demande de paiement",
    plateforme: "vinted",
    annonce: {
      titre: "Carte cadeau Fnac 50 €",
      description: "Vends carte cadeau Fnac, valable un an.",
      prix_eur: 45,
    },
    attendu: { niveau: "faible", absents: ["paiement.mandat_carte_cadeau"] },
  },
  {
    nom: "Annonce de portefeuille crypto (le mot crypto n'est pas un moyen de paiement)",
    plateforme: "vinted",
    annonce: {
      titre: "Portefeuille crypto Ledger",
      description: "Ledger Nano, bitcoin et ethereum.",
      prix_eur: 40,
    },
    attendu: { niveau: "faible", absents: ["paiement.mandat_carte_cadeau"] },
  },
  {
    nom: "Vinted : « pas de souci, je fais un virement » n'est pas une négation",
    plateforme: "vinted",
    annonce: { titre: "Jean", prix_eur: 20 },
    messages: [["vendeur", "Pas de souci je fais un virement si tu préfères."]],
    attendu: { niveau: "moyen", presents: ["paiement.virement"] },
  },
  {
    nom: "Vinted : photos sur un hébergeur d'images, « j'envoie le colis » (aucun signal critique)",
    plateforme: "vinted",
    annonce: { titre: "Appareil photo", prix_eur: 90 },
    messages: [
      [
        "vendeur",
        "Voici d'autres photos : https://imgur.com/a/abc123. Si ça te va tu peux payer, j'envoie le colis demain.",
      ],
    ],
    attendu: {
      niveau: "faible",
      absents: ["script.faux_transporteur", "script.paiement_effectue_lien"],
      critique: false,
    },
  },
  {
    nom: "Vinted : « j'ai bien envoyé le colis, valide la réception » avec un lien de suivi",
    plateforme: "vinted",
    annonce: { titre: "Veste", prix_eur: 40 },
    messages: [
      [
        "vendeur",
        "J'ai bien envoyé le colis, tu peux valider la réception quand tu l'as : https://www.suivi-colis-exemple.fr/abc",
      ],
    ],
    attendu: { niveau: "faible", absents: ["script.paiement_effectue_lien"], critique: false },
  },
  {
    nom: "Vinted : colis envoyé par erreur à une ancienne adresse (pas un « trop-perçu »)",
    plateforme: "vinted",
    annonce: { titre: "Chaussures", prix_eur: 30 },
    messages: [
      [
        "vendeur",
        "J'ai envoyé le colis par erreur à ton ancienne adresse, je te rembourse les frais de port.",
      ],
    ],
    attendu: { niveau: "faible", absents: ["script.trop_percu"], critique: false },
  },
  {
    nom: "Vinted : « code postal » n'est pas un code SMS",
    plateforme: "vinted",
    annonce: { titre: "Lampe", prix_eur: 22 },
    messages: [
      [
        "vendeur",
        "Je suis à Paris, code postal 75011. Donne-moi ton numéro de téléphone si tu veux qu'on s'organise.",
      ],
    ],
    attendu: { niveau: "faible", absents: ["paiement.code_sms"], critique: false },
  },
  {
    nom: "Vinted : dépôt chez le transporteur, frais de port inclus (aucun lien)",
    plateforme: "vinted",
    annonce: { titre: "Pull", prix_eur: 18 },
    messages: [
      ["vendeur", "Je dépose le colis chez Mondial Relay demain, les frais de port sont inclus."],
    ],
    attendu: { niveau: "faible", absents: ["script.faux_transporteur"], critique: false },
  },
  {
    nom: "Vinted : adresse e-mail d'un domaine officiel dans un message collé",
    plateforme: "vinted",
    annonce: { titre: "Sac", prix_eur: 35 },
    messages: [["vendeur", "Pour toute question, écris à support@vinted.fr, ils répondent vite."]],
    attendu: { niveau: "faible", absents: ["plateforme.email"], critique: false },
  },
  {
    nom: "Vinted : description « pas de PayPal, pas de virement »",
    plateforme: "vinted",
    annonce: {
      titre: "Robe",
      description: "Pas de PayPal, pas de virement. Envoi suivi sous 48 h.",
      prix_eur: 28,
    },
    attendu: {
      niveau: "faible",
      absents: ["paiement.paypal", "paiement.virement"],
      critique: false,
    },
  },
];

export const CAS_SUSPECTS: readonly CasConversation[] = [
  {
    nom: "WhatsApp + virement depuis un compte de quelques jours",
    plateforme: "vinted",
    annonce: { titre: "Montre", prix_eur: 90 },
    vendeur: { anciennete_jours: 5, nombre_avis: 0, nombre_annonces: 12 },
    messages: [
      [
        "vendeur",
        "Écris-moi sur WhatsApp au 06 11 22 33 44, c'est plus simple. Je préfère un virement, je te donne mon IBAN.",
      ],
    ],
    attendu: {
      niveau: "élevé",
      presents: [
        "plateforme.whatsapp",
        "plateforme.telephone",
        "paiement.virement",
        "profil.compte_tres_recent",
        "profil.aucun_avis",
      ],
      critique: false,
    },
  },
  {
    nom: "Faux transporteur avec lien imitant Mondial Relay",
    plateforme: "vinted",
    annonce: { titre: "Appareil photo", prix_eur: 150 },
    messages: [
      [
        "vendeur",
        "Bonjour, votre colis Mondial Relay est bloqué. Réglez 2,99 € de frais de livraison ici : https://mondialrelay-livraison.com/pay",
      ],
    ],
    attendu: {
      niveau: "élevé",
      presents: ["script.faux_transporteur", "lien.imitation_marque"],
      critique: true,
    },
  },
  {
    nom: "« J'ai payé, clique ici pour recevoir l'argent »",
    plateforme: "vinted",
    annonce: { titre: "Console", prix_eur: 120 },
    messages: [
      [
        "vendeur",
        "J'ai déjà payé ! Clique ici pour recevoir l'argent : https://vinted-paiement.com/recevoir",
      ],
    ],
    attendu: {
      niveau: "élevé",
      presents: ["script.paiement_effectue_lien", "lien.imitation_marque"],
      critique: true,
    },
  },
  {
    nom: "Demande du code reçu par SMS",
    plateforme: "vinted",
    annonce: { titre: "Veste", prix_eur: 30 },
    messages: [["vendeur", "Pour valider ton compte vendeur, envoie-moi le code reçu par SMS"]],
    attendu: { niveau: "élevé", presents: ["paiement.code_sms"], critique: true },
  },
  {
    nom: "Demande du code reçu par SMS (« envoyez-moi… »)",
    plateforme: "vinted",
    annonce: { titre: "Manteau", prix_eur: 45 },
    messages: [["vendeur", "Envoyez-moi le code reçu par SMS pour confirmer votre commande"]],
    attendu: { niveau: "élevé", presents: ["paiement.code_sms"], critique: true },
  },
  {
    nom: "PayPal « entre proches » pour éviter les frais",
    plateforme: "vinted",
    annonce: { titre: "Casque", prix_eur: 70 },
    messages: [
      ["vendeur", "Je préfère PayPal entre proches pour éviter les frais, c'est plus simple"],
    ],
    attendu: {
      niveau: "élevé",
      presents: ["paiement.paypal_proches", "plateforme.hors_plateforme"],
      critique: false,
    },
  },
  {
    nom: "Paiement exclusivement par mandat cash ou carte Neosurf",
    plateforme: "leboncoin",
    annonce: { titre: "Scooter", prix_eur: 900 },
    messages: [["vendeur", "Je n'accepte que le mandat cash ou une carte Neosurf"]],
    attendu: { niveau: "élevé", presents: ["paiement.mandat_carte_cadeau"], critique: true },
  },
  {
    nom: "Demande de numéro de carte et de cryptogramme",
    plateforme: "vinted",
    annonce: { titre: "Tablette", prix_eur: 110 },
    messages: [
      [
        "vendeur",
        "Envoie-moi le numéro de ta carte et le cryptogramme pour que je reçoive le paiement",
      ],
    ],
    attendu: { niveau: "élevé", presents: ["paiement.coordonnees_bancaires"], critique: true },
  },
  {
    nom: "Faux « paiement sécurisé » avec lien imitant Vinted",
    plateforme: "vinted",
    annonce: { titre: "Sac", prix_eur: 60 },
    messages: [
      [
        "vendeur",
        "Pour un paiement sécurisé Vinted, clique sur ce lien : https://vinted-securise.fr/pay",
      ],
    ],
    attendu: {
      niveau: "élevé",
      presents: ["script.paiement_securise_faux", "lien.imitation_marque"],
      critique: true,
    },
  },
  {
    nom: "Faux « trop-perçu » à rembourser",
    plateforme: "vinted",
    annonce: { titre: "Lampe", prix_eur: 25 },
    messages: [
      ["vendeur", "Je t'ai envoyé 50 € de trop par erreur, peux-tu me rembourser la différence ?"],
    ],
    attendu: { niveau: "moyen", presents: ["script.trop_percu"], critique: false },
  },
  {
    nom: "Sac de luxe à 25 € depuis un compte tout neuf, avec pression",
    plateforme: "vinted",
    annonce: {
      titre: "Sac Louis Vuitton Neverfull",
      marque: "Louis Vuitton",
      prix_eur: 25,
      nombre_photos: 1,
    },
    vendeur: { anciennete_jours: 3, nombre_avis: 0, nombre_annonces: 14 },
    messages: [["vendeur", "Dernier prix, répondez vite car plusieurs personnes sont intéressées"]],
    attendu: {
      niveau: "élevé",
      presents: ["prix.tres_bas", "profil.compte_tres_recent", "urgence.forte"],
      critique: false,
    },
  },
  {
    nom: "Lien raccourci pour « recevoir le paiement »",
    plateforme: "vinted",
    annonce: { titre: "Livre", prix_eur: 15 },
    messages: [["vendeur", "Voici le lien pour recevoir le paiement : bit.ly/3xYz"]],
    attendu: { niveau: "moyen", presents: ["lien.raccourci"], critique: false },
  },
  {
    nom: "Telegram et urgence",
    plateforme: "vinted",
    annonce: { titre: "Enceinte", prix_eur: 80 },
    messages: [
      ["vendeur", "Contactez-moi vite sur Telegram, sinon je le vends à quelqu'un d'autre"],
    ],
    attendu: {
      niveau: "moyen",
      presents: ["plateforme.telegram", "urgence.forte"],
      critique: false,
    },
  },
  {
    nom: "Demande d'une photo de pièce d'identité",
    plateforme: "vinted",
    annonce: { titre: "Vélo", prix_eur: 200 },
    messages: [["vendeur", "Envoie-moi une photo de ta carte d'identité pour vérifier ton compte"]],
    attendu: {
      niveau: "moyen",
      presents: ["script.piece_identite"],
      absents: ["paiement.coordonnees_bancaires"],
      critique: false,
    },
  },
  {
    nom: "Demande d'acompte",
    plateforme: "leboncoin",
    annonce: { titre: "Canapé", prix_eur: 300 },
    messages: [["vendeur", "Verse un acompte de 50 € pour réserver l'article"]],
    attendu: { niveau: "moyen", presents: ["paiement.acompte"], critique: false },
  },
  {
    nom: "Lien avec un « і » cyrillique imitant vinted.fr",
    plateforme: "vinted",
    annonce: { titre: "Robe", prix_eur: 30 },
    messages: [["vendeur", "Paie ici : vіnted.fr/paiement"]],
    attendu: { niveau: "élevé", presents: ["lien.caracteres_inhabituels"], critique: true },
  },
  {
    nom: "mondialrelay-be.com (domaine de phishing réel) : suspect, pas officiel",
    plateforme: "vinted",
    annonce: { titre: "Sneakers", prix_eur: 55 },
    messages: [["vendeur", "Suivi de votre colis : https://mondialrelay-be.com/suivi"]],
    attendu: { niveau: "moyen", presents: ["lien.imitation_marque"], critique: false },
  },
  {
    nom: "Texte collé sans IA : WhatsApp et virement",
    texte:
      "Salut, je suis intéressé mais je préfère qu'on parle sur WhatsApp. Pour le paiement je te propose un virement.",
    attendu: {
      niveau: "élevé",
      presents: ["plateforme.whatsapp", "paiement.virement"],
      critique: false,
    },
  },
  {
    nom: "Frais de douane demandés, sans lien",
    plateforme: "vinted",
    annonce: { titre: "Montre", prix_eur: 120 },
    messages: [
      ["vendeur", "Le colis est bloqué en douane, il faut régler 45 € de frais de douane"],
    ],
    attendu: {
      niveau: "moyen",
      presents: ["script.frais_supplementaires"],
      absents: ["script.faux_transporteur"],
      critique: false,
    },
  },
  {
    nom: "Transitaire et dédouanement à payer d'avance",
    plateforme: "vinted",
    annonce: { titre: "Ordinateur portable", prix_eur: 300 },
    messages: [
      [
        "vendeur",
        "Je suis à l'étranger, mon transitaire récupère le colis, il faut payer d'avance 100 € pour le dédouanement",
      ],
    ],
    attendu: { niveau: "moyen", presents: ["script.frais_supplementaires"], critique: false },
  },
  {
    nom: "On te demande d'avancer l'argent « et je te rembourse ensuite »",
    plateforme: "vinted",
    annonce: { titre: "Téléphone", prix_eur: 150 },
    messages: [["vendeur", "Avance les frais d'envoi, je te rembourse ensuite"]],
    attendu: { niveau: "moyen", presents: ["script.rembourse_apres"], critique: false },
  },
  {
    nom: "Description : « paiement par virement uniquement »",
    plateforme: "vinted",
    annonce: {
      titre: "Appareil",
      description: "Paiement par virement uniquement, envoi sous 24 h.",
      prix_eur: 100,
    },
    attendu: { niveau: "moyen", presents: ["paiement.virement"] },
  },
];

export const TOUS_LES_CAS: readonly CasConversation[] = [...CAS_SAINS, ...CAS_SUSPECTS];
