import type { CasEval } from "../../src/lib/eval/types";

const conv = (...lignes: string[]) => lignes.join("\n");

/**
 * Conversations et annonces saines, en texte collé. Deux groupes :
 * - « ordinaire » : un échange banal ;
 * - « piege » : ça ressemble à une arnaque sans en être une (négations, conseils de sécurité,
 *   liens officiels, numéro de téléphone pour une remise en main propre…). C'est là que se
 *   cachent les faux positifs.
 *
 * Les conversations sont fictives. À compléter avec de vraies conversations anonymisées.
 */
export const TEXTES_SAINS: readonly CasEval[] = [
  {
    id: "sain-01-vinted-achat-simple",
    categorie: "sain",
    groupe: "ordinaire",
    description: "Achat Vinted banal, conversation avec étiquettes (Moi / Vendeur)",
    entree: {
      texte: conv(
        "Moi : Bonjour, le pull en laine est toujours disponible ?",
        "Vendeur : Oui toujours dispo ! Il est en très bon état, porté deux fois.",
        "Moi : Parfait, je le prends. Tu peux me faire 12 € au lieu de 15 € ?",
        "Vendeur : Ok pour 13 €, c'est mon dernier prix.",
        "Moi : Marché conclu, merci !",
        "Vendeur : Je l'envoie demain via Vinted, tu auras le suivi directement dans l'appli.",
      ),
    },
    attendu: {
      niveauMax: "faible",
      extraction: {
        messages: [
          { contient: "le pull en laine est toujours disponible", auteur: "acheteur" },
          { contient: "porté deux fois", auteur: "vendeur" },
          { contient: "marché conclu", auteur: "acheteur" },
          { contient: "je l'envoie demain via vinted", auteur: "vendeur" },
        ],
      },
    },
  },
  {
    id: "sain-02-vinted-achat-sans-etiquettes",
    categorie: "sain",
    groupe: "ordinaire",
    description: "Même échange collé sans étiquette : les auteurs doivent rester « inconnu »",
    entree: {
      texte: conv(
        "Bonjour, le pull en laine est toujours disponible ?",
        "Oui toujours dispo ! Il est en très bon état, porté deux fois.",
        "Parfait, je le prends. Tu peux me faire 12 € au lieu de 15 € ?",
        "Ok pour 13 €, c'est mon dernier prix.",
        "Marché conclu, merci !",
        "Je l'envoie demain via Vinted, tu auras le suivi directement dans l'appli.",
      ),
    },
    attendu: {
      niveauMax: "faible",
      extraction: {
        messages: [
          { contient: "le pull en laine est toujours disponible", auteur: "inconnu" },
          { contient: "porté deux fois", auteur: "inconnu" },
          { contient: "je l'envoie demain via vinted", auteur: "inconnu" },
        ],
      },
    },
  },
  {
    id: "sain-03-leboncoin-main-propre-telephone",
    categorie: "sain",
    groupe: "piege",
    description: "Leboncoin : numéro de téléphone donné pour se retrouver en main propre",
    entree: {
      texte: conv(
        "Moi : Bonjour, le vélo enfant est toujours à vendre ?",
        "Vendeur : Oui. Je suis à Lyon 3e, on peut se voir samedi matin si tu veux. Mon numéro : 06 12 34 56 78",
        "Moi : Parfait, 10h devant la gare de la Part-Dieu ?",
        "Vendeur : Ça marche, à samedi !",
      ),
    },
    attendu: { niveauMax: "faible" },
  },
  {
    id: "sain-04-leboncoin-especes-ou-virement",
    categorie: "sain",
    groupe: "piege",
    description: "Leboncoin : espèces à la remise, ou virement instantané proposé par le vendeur",
    entree: {
      texte: conv(
        "Moi : Bonjour, la table basse est encore disponible ?",
        "Vendeur : Oui. Paiement en espèces à la remise, ou virement instantané si tu préfères.",
        "Moi : Espèces, ce sera très bien. Je passe jeudi soir.",
      ),
    },
    attendu: { niveauMax: "faible" },
  },
  {
    id: "sain-05-vendeur-ecarte-lui-meme-hors-plateforme",
    categorie: "sain",
    groupe: "piege",
    description:
      "Le vendeur refuse virement, PayPal et WhatsApp (négations) ; l'acheteur les évoque",
    exigeIa: true,
    entree: {
      texte: conv(
        "Moi : Je peux payer par virement ou PayPal ?",
        "Vendeur : Pas de virement ni de PayPal, uniquement le paiement via Vinted, c'est plus sûr pour nous deux.",
        "Moi : D'accord, pas de souci.",
        "Vendeur : Et je ne donne pas mon WhatsApp, tout se passe ici dans la messagerie.",
      ),
    },
    attendu: {
      niveauMax: "faible",
      signauxInterdits: ["paiement.virement", "paiement.paypal", "plateforme.whatsapp"],
      extraction: {
        messages: [
          { contient: "je peux payer par virement ou paypal", auteur: "acheteur" },
          { contient: "pas de virement ni de paypal", auteur: "vendeur" },
        ],
      },
    },
  },
  {
    id: "sain-06-conseil-de-securite",
    categorie: "sain",
    groupe: "piege",
    description: "Le vendeur rappelle de ne jamais communiquer de code ni cliquer sur un lien",
    entree: {
      texte: conv(
        "Vendeur : Petit rappel : Vinted ne te demandera jamais ton code reçu par SMS. Ne le communique à personne et ne clique jamais sur un lien reçu par message.",
        "Moi : Merci pour l'info !",
        "Vendeur : De rien, bonne journée.",
      ),
    },
    attendu: { niveauMax: "faible", signauxInterdits: ["paiement.code_sms"] },
  },
  {
    id: "sain-07-suivi-colis-officiel",
    categorie: "sain",
    groupe: "piege",
    description: "Lien de suivi sur le site officiel de Mondial Relay",
    entree: {
      texte: conv(
        "Vendeur : Colis déposé en point relais ! Voici le suivi : https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition=12345678",
        "Moi : Super, merci. Je te dis dès que je l'ai.",
      ),
    },
    attendu: {
      niveauMax: "faible",
      signauxInterdits: ["script.faux_transporteur", "liens.externe"],
    },
  },
  {
    id: "sain-08-acheteur-propose-paypal-whatsapp",
    categorie: "sain",
    groupe: "piege",
    description:
      "C'est l'acheteur qui propose PayPal et WhatsApp ; le vendeur reste sur la plateforme",
    exigeIa: true,
    entree: {
      texte: conv(
        "Moi : Salut, tu acceptes PayPal ? Ou on peut parler sur WhatsApp si tu veux, ce sera plus simple.",
        "Vendeur : Non je reste sur Vinted, c'est plus sûr. Tu peux payer directement via l'appli.",
      ),
    },
    attendu: {
      niveauMax: "faible",
      signauxInterdits: ["paiement.paypal", "plateforme.whatsapp"],
      extraction: {
        messages: [
          { contient: "tu acceptes paypal", auteur: "acheteur" },
          { contient: "je reste sur vinted", auteur: "vendeur" },
        ],
      },
    },
  },
  {
    id: "sain-09-photos-sur-imgur",
    categorie: "sain",
    groupe: "piege",
    description: "Le vendeur partage un album photo sur un hébergeur d'images",
    entree: {
      texte: conv(
        "Moi : Tu aurais d'autres photos de l'article ?",
        "Vendeur : Oui, voici l'album : https://imgur.com/a/Xk3mP9q",
        "Moi : Merci, il est super !",
      ),
    },
    attendu: {
      niveauMax: "faible",
      signauxInterdits: ["script.faux_transporteur", "script.paiement_effectue_lien"],
    },
  },
  {
    id: "sain-10-frais-de-port-inclus",
    categorie: "sain",
    groupe: "piege",
    description:
      "Dépôt chez Mondial Relay, frais de port inclus (mots transporteur et frais, sans lien)",
    entree: {
      texte: conv(
        "Vendeur : Je dépose le colis chez Mondial Relay demain, les frais de port sont inclus dans le prix.",
        "Moi : Parfait, merci.",
      ),
    },
    attendu: {
      niveauMax: "faible",
      signauxInterdits: ["script.faux_transporteur", "script.frais_supplementaires"],
    },
  },
  {
    id: "sain-11-message-systeme-paiement-effectue",
    categorie: "sain",
    groupe: "piege",
    description: "Message système collé : « Le paiement … a été effectué »",
    entree: {
      texte:
        "Le paiement de 25,00 € a été effectué. Le vendeur doit expédier l'article sous 5 jours ouvrés. Vous recevrez un message dès l'envoi.",
    },
    attendu: { niveauMax: "faible", signauxInterdits: ["script.paiement_effectue_lien"] },
  },
  {
    id: "sain-12-profil-ancien-et-annonce",
    categorie: "sain",
    groupe: "ordinaire",
    description: "Profil vendeur ancien et vérifié collé avec une annonce banale",
    entree: {
      texte: conv(
        "Profil du vendeur",
        "claire_b",
        "Membre depuis 4 ans · 152 évaluations · 4,9 sur 5",
        "Profil vérifié (e-mail, téléphone)",
        "Paris 11e · 48 articles",
        "",
        "Robe Zara, taille 38, très bon état. 20 €.",
      ),
    },
    attendu: {
      niveauMax: "faible",
      extraction: {
        annonce: { prix_eur: 20 },
        vendeur: {
          nombre_avis: 152,
          note_sur_5: 4.9,
          profil_verifie: true,
          nombre_annonces: 48,
          anciennete_jours: { valeur: 1461, tolerance: 200 },
        },
      },
    },
  },
  {
    id: "sain-13-annonce-longchamp",
    categorie: "sain",
    groupe: "ordinaire",
    description: "Annonce seule, sac de marque courante à un prix normal",
    entree: {
      texte:
        "Sac Longchamp Le Pliage taille M, noir, très bon état, quelques traces d'usure à l'intérieur. 45 €. Envoi suivi possible.",
    },
    attendu: {
      niveauMax: "faible",
      extraction: { annonce: { prix_eur: 45, marque: "Longchamp" } },
    },
  },
  {
    id: "sain-14-iphone-prix-realiste",
    categorie: "sain",
    groupe: "ordinaire",
    description: "iPhone d'occasion à un prix réaliste, avec facture",
    entree: {
      texte:
        "iPhone 13 128 Go minuit, batterie 89 %, aucune rayure, avec facture et boîte d'origine. 380 €. Remise en main propre ou envoi suivi.",
    },
    attendu: { niveauMax: "faible", extraction: { annonce: { prix_eur: 380 } } },
  },
  {
    id: "sain-15-langage-familier",
    categorie: "sain",
    groupe: "ordinaire",
    description: "Échange très court et familier",
    entree: {
      texte: conv(
        "Moi : Yo dispo ?",
        "Vendeur : ouais",
        "Moi : tu peux faire 15 ?",
        "Vendeur : ok 15 go",
      ),
    },
    attendu: { niveauMax: "faible" },
  },
  {
    id: "sain-16-conversation-en-anglais",
    categorie: "sain",
    groupe: "ordinaire",
    description: "Conversation en anglais",
    entree: {
      texte: conv(
        "Buyer: Hi, is the jacket still available?",
        "Seller: Yes! I can ship it tomorrow with tracking through Vinted.",
        "Buyer: Great, I'll take it.",
      ),
    },
    attendu: { niveauMax: "faible" },
  },
  {
    id: "sain-17-annonce-urgent-demenagement",
    categorie: "sain",
    groupe: "piege",
    description:
      "Annonce en majuscules « URGENT DÉMÉNAGEMENT » (l'urgence d'une annonce n'est pas une pression)",
    entree: {
      texte:
        "URGENT DÉMÉNAGEMENT ! TOUT DOIT PARTIR CETTE SEMAINE ! Table basse en chêne, 60 €. À venir chercher à Nantes.",
    },
    attendu: { niveauMax: "faible" },
  },
  {
    id: "sain-18-code-postal",
    categorie: "sain",
    groupe: "piege",
    description: "« code postal » et « numéro de téléphone » demandés pour la remise",
    entree: {
      texte:
        "Vendeur : Je suis à Paris, code postal 75011. Donne-moi ton numéro de téléphone si tu veux qu'on s'organise pour la remise.",
    },
    attendu: {
      niveauMax: "faible",
      signauxInterdits: ["paiement.code_sms", "paiement.coordonnees_bancaires"],
    },
  },
  {
    id: "sain-19-pression-legere-negociation",
    categorie: "sain",
    groupe: "piege",
    description:
      "Négociation un peu pressante (dernier prix, plusieurs intéressés) mais rien d'anormal",
    entree: {
      texte: conv(
        "Moi : Tu peux faire un effort sur le prix ?",
        "Vendeur : Dernier prix 30 €, il y a plusieurs personnes intéressées donc dis-moi vite.",
      ),
    },
    attendu: { niveauMax: "faible" },
  },
  {
    id: "sain-20-email-pour-facture",
    categorie: "sain",
    groupe: "piege",
    description: "Une boutique donne son e-mail pour la facture",
    entree: {
      texte: conv(
        "Vendeur : Boutique pro, envoi sous 24 h avec suivi. Pour une facture, écris-moi à contact@boutique-lumiere.fr",
        "Moi : Merci, je vous écris ce soir.",
      ),
    },
    attendu: { niveauMax: "faible" },
  },
  {
    id: "sain-21-acheteur-sans-whatsapp",
    categorie: "sain",
    groupe: "piege",
    description: "L'acheteur dit qu'il n'a pas WhatsApp",
    entree: {
      texte: conv(
        "Moi : Je n'ai pas WhatsApp, on reste ici ?",
        "Vendeur : Oui bien sûr, pas de souci.",
      ),
    },
    attendu: { niveauMax: "faible", signauxInterdits: ["plateforme.whatsapp"] },
  },
  {
    id: "sain-22-remise-en-main-propre-especes",
    categorie: "sain",
    groupe: "ordinaire",
    description: "Remise en main propre, paiement en espèces",
    entree: {
      texte:
        "Vendeur : Je peux te le remettre en main propre à Paris 11e, mardi soir vers 19h. Paiement en espèces à la remise, ça te va ?",
    },
    attendu: { niveauMax: "faible" },
  },
  {
    id: "sain-23-vinted-go",
    categorie: "sain",
    groupe: "ordinaire",
    description: "Envoi par Vinted Go, rien à payer en plus",
    entree: {
      texte: conv(
        "Vendeur : Je choisis Mondial Relay avec Vinted Go, tu n'as rien à payer en plus. Je dépose demain avant 17h.",
        "Moi : Top, merci !",
      ),
    },
    attendu: { niveauMax: "faible" },
  },
  {
    id: "sain-24-vendeur-previent-contre-les-arnaques",
    categorie: "sain",
    groupe: "piege",
    description:
      "Le vendeur annonce qu'il ne fait jamais de virement et met en garde contre les codes",
    entree: {
      texte:
        "Vendeur : Je ne fais jamais de virement ni de PayPal, uniquement Vinted. Et n'envoie jamais ton code de vérification à personne, même si on se dit de Vinted.",
    },
    attendu: {
      niveauMax: "faible",
      signauxInterdits: ["paiement.virement", "paiement.paypal", "paiement.code_sms"],
    },
  },
  {
    id: "sain-25-sac-luxe-prix-coherent",
    categorie: "sain",
    groupe: "ordinaire",
    description: "Sac de luxe à un prix cohérent, avec facture",
    entree: {
      texte:
        "Sac Louis Vuitton Speedy 30 authentique, toile monogram, facture disponible, quelques traces sur les anses. 520 €.",
    },
    attendu: { niveauMax: "faible", signauxInterdits: ["prix.tres_bas", "prix.bas"] },
  },
  {
    id: "sain-26-boutique-pro-paiement-securise",
    categorie: "sain",
    groupe: "piege",
    description: "Boutique pro qui mentionne le paiement sécurisé de la plateforme (sans lien)",
    entree: {
      texte:
        "Vendeur : Boutique pro, paiement sécurisé via Vinted, envoi en 24 h avec suivi. Garantie 14 jours si l'article ne convient pas.",
    },
    attendu: { niveauMax: "faible", signauxInterdits: ["script.paiement_securise_faux"] },
  },
  {
    id: "sain-27-sav-litige-vinted",
    categorie: "sain",
    groupe: "piege",
    description:
      "Le vendeur explique la procédure de litige de la plateforme et promet un remboursement",
    entree: {
      texte:
        "Vendeur : Si l'article ne te convient pas, tu as 2 jours après réception pour ouvrir un litige via Vinted, et je te rembourserai sans problème.",
    },
    attendu: {
      niveauMax: "faible",
      signauxInterdits: ["script.rembourse_apres", "script.trop_percu"],
    },
  },
];
