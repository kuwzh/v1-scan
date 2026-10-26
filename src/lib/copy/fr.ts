import { APP_NAME } from "../config";
import type { CodeErreur } from "../contracts/errors";
import { MAX_IMAGES } from "../contracts/limits";
import type { Gravite } from "../contracts/signals";
import type { Niveau } from "../contracts/niveau";

/** 45 → « 45 € », 12,5 → « 12,50 € ». */
function formaterPrix(prix: number): string {
  const entier = Number.isInteger(prix);
  return `${entier ? String(prix) : prix.toFixed(2).replace(".", ",")} €`;
}

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
  forteAffluence:
    "Forte affluence, analyse partielle : l'analyse par IA est suspendue pour le moment, ce résultat repose uniquement sur des règles automatiques.",
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

  /**
   * Libellés des signaux d'alerte et des éléments rassurants produits par les règles.
   * Ils décrivent ce qui est dit ou affiché (« On te propose… »), jamais la personne.
   */
  regles: {
    plateforme: {
      whatsapp:
        "On te propose de continuer la discussion sur WhatsApp, en dehors de la plateforme.",
      telegram:
        "On te propose de continuer la discussion sur Telegram, en dehors de la plateforme.",
      autreReseau:
        "On te propose un autre réseau ou une autre appli (Instagram, Snapchat…) pour discuter.",
      sms: "On te propose de continuer par SMS, en dehors de la plateforme.",
      telephone: "Un numéro de téléphone est donné pour continuer en dehors de la plateforme.",
      email: "Une adresse e-mail est donnée pour continuer en dehors de la plateforme.",
      horsPlateforme: "On te propose explicitement de passer en dehors de la plateforme.",
    },
    paiement: {
      virement:
        "Un paiement par virement est évoqué : il n'offre pas la protection de la plateforme.",
      paypalProches:
        "PayPal « entre proches » est évoqué : ce mode ne protège pas l'acheteur et ne permet aucun remboursement.",
      paypal: "Un paiement par PayPal est évoqué, en dehors de la plateforme.",
      lydia: "Un paiement par Lydia ou par cagnotte est évoqué, en dehors de la plateforme.",
      cheque: "Un paiement par chèque est évoqué, en dehors de la plateforme.",
      mandatCarteCadeau:
        "Le paiement est demandé par mandat, carte cadeau ou crypto : impossible à récupérer en cas de problème.",
      acompte: "Un acompte ou des arrhes sont demandés avant que tu aies reçu l'objet.",
      coordonneesBancaires:
        "On te demande des informations de carte bancaire (numéro, date, cryptogramme).",
      codeSms:
        "On te demande un code reçu par SMS ou par e-mail : il ne doit jamais être communiqué.",
    },
    scripts: {
      paiementEffectueLien:
        "Le message dit qu'un paiement a été fait et te demande de cliquer sur un lien pour le recevoir : c'est un scénario courant de faux paiement.",
      fauxTransporteur:
        "Le message parle d'un colis ou de frais de livraison et renvoie vers un lien qui n'est pas celui d'un transporteur connu.",
      fraisSupplementaires:
        "Des frais supplémentaires (douane, assurance, déblocage…) sont demandés en dehors de la plateforme.",
      paiementSecuriseFaux:
        "Un « paiement sécurisé » est mis en avant, mais le lien ou les informations demandées ne viennent pas de la plateforme.",
      tropPercu:
        "On te demande de rembourser un « trop-perçu » ou une erreur de montant : c'est un schéma classique de paiement frauduleux.",
      rembourseApres: "On te demande d'avancer de l'argent en promettant de te rembourser ensuite.",
      pieceIdentite: "On te demande une photo de pièce d'identité.",
    },
    urgence: {
      forte: "Plusieurs formules mettent la pression pour aller vite.",
      legere: "Une formule met la pression pour aller vite.",
    },
    profil: {
      compteTresRecent: "Le compte a été créé il y a moins d'une semaine.",
      compteRecent: "Le compte a été créé il y a moins d'un mois.",
      compteAssezRecent: "Le compte a été créé il y a moins de trois mois.",
      aucunAvis: "Le profil n'a encore aucun avis.",
      peuDAvis: "Le profil n'a que quelques avis.",
      noteBasse: "La note du profil est basse.",
      noteTresBasse: "La note du profil est très basse.",
      beaucoupDAnnoncesCompteRecent: "Le compte est récent mais publie déjà beaucoup d'annonces.",
      nonVerifie: "Le profil n'est pas vérifié par la plateforme.",
      compteAncien: "Le compte existe depuis longtemps.",
      compteAssezAncien: "Le compte existe depuis plus d'un an.",
      nombreuxAvis: "Le profil a de nombreux avis, avec une très bonne note.",
      plusieursAvis: "Le profil a plusieurs avis positifs.",
      verifie: "Le profil est vérifié par la plateforme.",
    },
    liens: {
      externe: "Un lien vers un site externe est partagé. Vérifie son adresse avant de cliquer.",
    },
    prix: {
      tresBas: (prix: number, marque: string) =>
        `Le prix de ${formaterPrix(prix)} est très inférieur à ce qu'on voit d'habitude pour un article ${marque}.`,
      bas: (prix: number, marque: string) =>
        `Le prix de ${formaterPrix(prix)} est inhabituellement bas pour un article ${marque}.`,
    },
    annonce: {
      unePhoto: "L'annonce n'a qu'une seule photo pour un article de valeur.",
    },
    rassurants: {
      paiementPlateforme: "Le paiement et la livraison passent par la plateforme.",
    },
  },

  /** Conseils concrets rattachés à certaines règles (tutoiement, formulation directe). */
  conseilsRegles: {
    horsPlateforme:
      "Reste dans la messagerie de la plateforme : c'est elle qui te protège en cas de problème.",
    paiementHors:
      "Paie uniquement via le paiement de la plateforme, jamais par virement ou en dehors.",
    paypalProches:
      "Refuse PayPal « entre proches » : il n'y a aucun remboursement possible en cas de souci.",
    mandatCarteCadeau:
      "Ne paie jamais par mandat, carte cadeau ou crypto : ces paiements ne se récupèrent pas.",
    coordonnees: "Ne donne jamais ton numéro de carte, sa date d'expiration ni son cryptogramme.",
    code: "Ne communique jamais un code reçu par SMS ou par e-mail, même à quelqu'un qui dit représenter la plateforme.",
    lien: "N'ouvre pas ce lien et ne saisis aucune information dessus. Passe par l'application ou le site officiel.",
    paiementRecu:
      "Si on te dit qu'un paiement t'attend, vérifie-le directement dans ton compte sur le site officiel, jamais via un lien reçu.",
    transporteur:
      "Les frais de livraison se règlent via la plateforme. Vérifie un suivi uniquement sur le site officiel du transporteur.",
    identite: "Ne transmets pas de pièce d'identité à un inconnu.",
    profilRecent: "Demande une photo de l'objet avec ton pseudo écrit à la main sur un papier.",
    prixBas:
      "Un prix très bas est un appât classique : demande des photos supplémentaires et des détails que seul le propriétaire peut donner.",
    urgence: "Ne te laisse pas presser : une vraie vente peut attendre quelques heures.",
    tropPercu:
      "Ne rembourse jamais un trop-perçu : vérifie d'abord que l'argent est bien arrivé sur ton compte.",
    acompte: "Ne verse pas d'acompte avant d'avoir reçu l'objet.",
  },

  erreurs: {
    entree_invalide: "On n'a pas pu lire ta demande. Vérifie ce que tu as envoyé et réessaie.",
    image_invalide:
      "Cette image n'est pas acceptée. Envoie une capture au format JPEG, PNG ou WebP.",
    trop_de_requetes:
      "Tu as fait beaucoup de vérifications en peu de temps. Réessaie dans quelques minutes.",
    plafond_atteint: `Forte affluence : ${APP_NAME} ne peut pas lire de captures pour le moment. Colle plutôt le texte de la conversation, ou reviens plus tard.`,
    ia_indisponible: "L'analyse n'est pas disponible pour le moment. Réessaie dans un instant.",
    analyse_impossible:
      "On n'a pas réussi à lire cette capture. Essaie avec une capture plus nette, ou colle le texte de la conversation.",
    lien_non_recuperable:
      "On n'a pas pu récupérer cette annonce. Envoie plutôt une capture de l'annonce.",
    vote_impossible:
      "Ce vote n'a pas pu être enregistré : il a déjà été donné, ou ce résultat est trop ancien.",
    erreur_interne: "Quelque chose s'est mal passé de notre côté. Réessaie dans un instant.",
  } satisfies Record<CodeErreur, string>,

  /** Précisions pour les erreurs de validation : remplacent le message générique du code. */
  erreursPrecises: {
    tropDImages: `Tu peux envoyer jusqu'à ${MAX_IMAGES} captures à la fois.`,
    imageTropLourde:
      "Une des captures est trop lourde. Envoie-la en plus petit ou recadre la partie utile.",
    requeteTropVolumineuse:
      "Les captures envoyées sont trop volumineuses. Envoie-en moins ou en plus petit.",
    corpsIllisible: "On n'a pas pu lire ta demande. Réessaie en renvoyant les captures.",
  },
} as const;
