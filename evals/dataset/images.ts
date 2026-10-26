import type { CasEval } from "../../src/lib/eval/types";

/**
 * Date du jour fixée pour l'évaluation : l'ancienneté d'un compte se calcule à partir d'elle,
 * donc les valeurs attendues ci-dessous restent valables quel que soit le jour où l'on lance.
 * « Membre depuis mars 2023 » → du 15 mars 2023 au 15 juin 2026 = 1188 jours.
 */
export const DATE_EVAL = "2026-06-15";

/**
 * Captures fictives (voir `evals/images/generer.mjs`). Deux d'entre elles testent surtout la
 * discipline de l'IA :
 * - « profil-sans-date » et « annonce-prix-masque » : une donnée n'est PAS sur l'image, elle doit
 *   rester null (sinon c'est une invention) ;
 * - « conversation-ambigue » : rien ne dit qui parle, les auteurs doivent rester « inconnu ».
 */
export const CAS_IMAGES: readonly CasEval[] = [
  {
    id: "img-01-profil-sain",
    categorie: "sain",
    groupe: "image",
    description: "Profil ancien, vérifié, 87 évaluations à 4,8",
    exigeIa: true,
    entree: { images: ["profil-sain.jpg"] },
    attendu: {
      niveauMax: "faible",
      extraction: {
        vendeur: {
          nombre_avis: 87,
          note_sur_5: 4.8,
          profil_verifie: true,
          nombre_annonces: 34,
          anciennete_jours: { valeur: 1188, tolerance: 60 },
        },
      },
    },
  },
  {
    id: "img-02-profil-neuf",
    categorie: "suspect",
    groupe: "moyen",
    description: "Profil de 4 jours, aucune évaluation, non vérifié, 14 articles",
    exigeIa: true,
    entree: { images: ["profil-neuf.jpg"] },
    attendu: {
      niveauMin: "moyen",
      signauxAttendus: ["profil.compte_tres_recent", "profil.aucun_avis"],
      extraction: {
        vendeur: {
          nombre_avis: 0,
          profil_verifie: false,
          nombre_annonces: 14,
          anciennete_jours: { valeur: 4, tolerance: 2 },
        },
      },
    },
  },
  {
    id: "img-03-profil-sans-date",
    categorie: "sain",
    groupe: "image",
    description:
      "Profil sans date d'inscription ni vérification affichées : ces deux données doivent rester null",
    exigeIa: true,
    entree: { images: ["profil-sans-date.jpg"] },
    attendu: {
      niveauMax: "faible",
      signauxInterdits: ["profil.compte_tres_recent", "profil.compte_recent", "profil.non_verifie"],
      extraction: {
        vendeur: {
          nombre_avis: 12,
          note_sur_5: 4.5,
          nombre_annonces: 8,
          anciennete_jours: null,
          profil_verifie: null,
        },
      },
    },
  },
  {
    id: "img-04-annonce-luxe-vendeur-neuf",
    categorie: "suspect",
    groupe: "critique",
    description: "Sac de luxe à 25 €, une seule photo, vendeur membre depuis 2 jours",
    exigeIa: true,
    entree: { images: ["annonce-luxe.jpg"] },
    attendu: {
      niveauMin: "élevé",
      signauxAttendus: ["prix.tres_bas"],
      extraction: {
        annonce: {
          titre: "Louis Vuitton Speedy",
          prix_eur: 25,
          marque: "Louis Vuitton",
          nombre_photos: 1,
        },
        vendeur: { anciennete_jours: { valeur: 2, tolerance: 2 } },
      },
    },
  },
  {
    id: "img-05-annonce-prix-masque",
    categorie: "sain",
    groupe: "image",
    description:
      "Annonce d'une montre dont le prix est recouvert : le prix doit rester null (aucune estimation)",
    exigeIa: true,
    entree: { images: ["annonce-prix-masque.jpg"] },
    attendu: {
      niveauMax: "faible",
      signauxInterdits: ["prix.tres_bas", "prix.bas"],
      extraction: {
        annonce: { titre: "Rolex Datejust", prix_eur: null, marque: "Rolex", nombre_photos: 6 },
      },
    },
  },
  {
    id: "img-06-conversation-saine",
    categorie: "sain",
    groupe: "image",
    description:
      "Conversation banale : bulles grises à gauche (vendeur), bleue à droite (acheteur)",
    exigeIa: true,
    entree: { images: ["conversation-saine.jpg"] },
    attendu: {
      niveauMax: "faible",
      extraction: {
        messages: [
          { contient: "toujours disponible", auteur: "vendeur" },
          { contient: "je le prends", auteur: "acheteur" },
          { contient: "tu peux payer via l'appli", auteur: "vendeur" },
        ],
      },
    },
  },
  {
    id: "img-07-conversation-suspecte",
    categorie: "suspect",
    groupe: "critique",
    description:
      "WhatsApp et virement avec IBAN proposés par l'interlocuteur (gauche) ; l'acheteur répond à droite",
    exigeIa: true,
    entree: { images: ["conversation-suspecte.jpg"] },
    attendu: {
      niveauMin: "élevé",
      signauxAttendus: ["plateforme.whatsapp", "paiement.virement"],
      extraction: {
        messages: [
          { contient: "whatsapp", auteur: "vendeur" },
          { contient: "virement", auteur: "vendeur" },
          { contient: "pourquoi pas via l'appli", auteur: "acheteur" },
        ],
      },
    },
  },
  {
    id: "img-08-conversation-sans-indice-d-auteur",
    categorie: "sain",
    groupe: "image",
    description:
      "Bulles centrées, même style, sans avatar : on ne peut pas dire qui parle, auteur « inconnu » attendu",
    exigeIa: true,
    entree: { images: ["conversation-ambigue.jpg"] },
    attendu: {
      niveauMax: "faible",
      extraction: {
        messages: [
          { contient: "toujours dispo", auteur: "inconnu" },
          { contient: "je le prends", auteur: "inconnu" },
          { contient: "je l'envoie demain", auteur: "inconnu" },
        ],
      },
    },
  },
];
