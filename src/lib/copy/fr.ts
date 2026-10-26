import { APP_NAME } from "../config";
import type { CodeErreur } from "../contracts/errors";
import type { Gravite } from "../contracts/signals";
import type { Niveau } from "../contracts/niveau";

/**
 * Tous les textes affichés à l'utilisateur, en français et au tutoiement.
 * Wording prudent : « risque », « signaux d'alerte ». Jamais d'accusation.
 * (Garde-fou : `wording.ts`, vérifié par les tests.)
 */
export const fr = {
  niveaux: {
    faible: {
      titre: "Risque faible",
      resume: "On n'a repéré que peu de signaux d'alerte.",
    },
    moyen: {
      titre: "Risque moyen",
      resume: "Quelques signaux d'alerte : reste prudent avant de payer.",
    },
    élevé: {
      titre: "Risque élevé",
      resume: "Plusieurs signaux d'alerte importants : mieux vaut ne pas continuer sans vérifier.",
    },
  } satisfies Record<Niveau, { titre: string; resume: string }>,

  gravites: {
    info: "À noter",
    attention: "Attention",
    importante: "Important",
    critique: "Critique",
  } satisfies Record<Gravite, string>,

  sections: {
    signaux: "Signaux d'alerte",
    rassurants: "Ce qui rassure",
    conseils: "Que faire maintenant ?",
  },

  aucunSignal: "On n'a repéré aucun signal d'alerte dans ce que tu as envoyé.",
  analysePartielle:
    "Analyse partielle : l'analyse par IA n'était pas disponible, ce résultat repose uniquement sur des règles automatiques.",
  disclaimer: `${APP_NAME} t'aide à décider, il ne garantit rien. Un risque faible ne veut pas dire « sans risque » : reste vigilant, surtout au moment de payer.`,

  feedback: {
    question: "Ce résultat était-il juste ?",
    oui: "Oui",
    non: "Non",
    merci: "Merci, ton avis nous aide à améliorer l'outil.",
  },

  /** Conseils de repli quand l'IA n'a pas fourni les siens. */
  conseilsParDefaut: {
    faible: [
      "Reste vigilant au moment de payer : utilise toujours le paiement proposé par la plateforme.",
      "Si quelque chose te semble bizarre par la suite, relance une vérification.",
    ],
    moyen: [
      "Paie uniquement via le paiement de la plateforme, jamais par virement ou en dehors.",
      "Demande des photos supplémentaires, par exemple l'objet avec ton pseudo écrit à la main sur un papier.",
      "Reste dans la messagerie de la plateforme.",
    ],
    élevé: [
      "Ne paie rien en dehors de la plateforme et ne clique sur aucun lien reçu.",
      "Ne communique pas tes informations bancaires ni les codes reçus par SMS.",
      "En cas de doute, arrête la discussion et signale l'annonce à la plateforme.",
    ],
  } satisfies Record<Niveau, string[]>,

  erreurs: {
    entree_invalide: "On n'a pas pu lire ta demande. Vérifie ce que tu as envoyé et réessaie.",
    image_invalide:
      "Cette image n'est pas acceptée. Envoie une capture au format JPEG, PNG ou WebP.",
    trop_de_requetes:
      "Tu as fait beaucoup de vérifications en peu de temps. Réessaie dans quelques minutes.",
    plafond_atteint: `${APP_NAME} a atteint sa limite d'analyses pour aujourd'hui. Reviens demain.`,
    ia_indisponible: "L'analyse n'est pas disponible pour le moment. Réessaie dans un instant.",
    analyse_impossible:
      "On n'a pas réussi à lire cette capture. Essaie avec une capture plus nette, ou colle le texte de la conversation.",
    lien_non_recuperable:
      "On n'a pas pu récupérer cette annonce. Envoie plutôt une capture de l'annonce.",
    erreur_interne: "Quelque chose s'est mal passé de notre côté. Réessaie dans un instant.",
  } satisfies Record<CodeErreur, string>,
} as const;
