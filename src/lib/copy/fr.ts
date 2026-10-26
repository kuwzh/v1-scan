import { APP_NAME } from "../config";
import type { CodeErreur } from "../contracts/errors";
import type { Gravite } from "../contracts/signals";
import type { Niveau } from "../contracts/niveau";

/** « colis », « paiement » (3 mots au plus). */
function listerMots(mots: readonly string[]): string {
  return mots
    .slice(0, 3)
    .map((m) => `« ${m} »`)
    .join(", ");
}

/** Complément de phrase quand des mots d'appât accompagnent une imitation de marque. */
function motsAppat(mots: readonly string[]): string {
  return mots.length > 0
    ? ` et contient des mots liés au paiement ou à la livraison (${listerMots(mots)})`
    : "";
}

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

  /**
   * Libellés des signaux d'alerte sur les liens. Ils décrivent l'adresse, jamais la
   * personne qui l'a envoyée. Les domaines affichés sont toujours en ASCII.
   */
  liens: {
    sousDomainePiege: (officiel: string, reel: string) =>
      `Le lien commence par « ${officiel} » mais mène en réalité vers « ${reel} », un autre site.`,
    identifiantsTrompeurs: (affiche: string, reel: string) =>
      `Le lien affiche « ${affiche} » avant un « @ », mais l'adresse réelle est « ${reel} ».`,
    identifiantsInhabituels: (reel: string) =>
      `Le lien contient un identifiant avant un « @ », ce qui peut masquer l'adresse réelle (« ${reel} »).`,
    imitationMarque: (nom: string, domaine: string, mots: readonly string[]) =>
      `L'adresse « ${domaine} » reprend le nom de ${nom} sans être son site officiel${motsAppat(mots)}.`,
    marqueSousDomaine: (nom: string, domaine: string, mots: readonly string[]) =>
      `Le nom de ${nom} apparaît au début de l'adresse, mais le site réel est « ${domaine} »${motsAppat(mots)}.`,
    ressemblanceMarque: (nom: string, domaine: string, mots: readonly string[]) =>
      `L'adresse « ${domaine} » ressemble à celle de ${nom} sans être la sienne${motsAppat(mots)}. Vérifie bien chaque lettre.`,
    marqueDansChemin: (nom: string, domaine: string) =>
      `Le lien cite ${nom} dans son chemin, mais il mène vers « ${domaine} », qui n'est pas son site officiel.`,
    raccourci: (domaine: string) =>
      `Ce lien raccourci (« ${domaine} ») cache l'adresse de destination.`,
    adresseIp: () => "Le lien utilise une adresse numérique au lieu d'un nom de site.",
    caracteresInhabituels: (hote: string, nom: string | null) =>
      nom
        ? `L'adresse « ${hote} » utilise des caractères spéciaux qui ressemblent à des lettres normales, comme pour reprendre le nom de ${nom}.`
        : `L'adresse « ${hote} » contient des caractères spéciaux, inhabituels pour un site français.`,
    tldSuspect: (tld: string) =>
      `La terminaison « .${tld} » est fréquente sur des sites éphémères. Ça ne prouve rien, mais c'est à noter.`,
    motsAppat: (domaine: string, mots: readonly string[]) =>
      `L'adresse « ${domaine} » contient des mots liés au paiement ou à la livraison (${listerMots(mots)}) alors que ce n'est pas un site connu.`,
    hebergementOuvert: (hote: string) =>
      `Le lien mène vers une page hébergée sur un service ouvert à tous (« ${hote} »), pas vers le site d'une marque.`,
    adresseInhabituelle: (domaine: string) =>
      `L'adresse « ${domaine} » est longue et pleine de tirets, ce qui est inhabituel pour un site officiel.`,
    domaineRecent: (jours: number) =>
      jours <= 1
        ? "Le nom de domaine de ce site a été créé il y a moins de deux jours."
        : `Le nom de domaine de ce site a été créé il y a seulement ${jours} jours.`,
  },

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
