import { APP_NAME } from "../config";
import type { CodeDiagnostic } from "../contracts/diagnostic";
import type { CodeErreur } from "../contracts/errors";
import type { Plateforme } from "../contracts/extracted";
import { MAX_IMAGES } from "../contracts/limits";
import type { Gravite } from "../contracts/signals";
import type { Niveau } from "../contracts/niveau";

/** 45 → « 45 € », 12,5 → « 12,50 € ». */
function formaterPrix(prix: number): string {
  const entier = Number.isInteger(prix);
  return `${entier ? String(prix) : prix.toFixed(2).replace(".", ",")} €`;
}

/** 1800 → « 1 800 € » (espace insécable), 45 → « 45 € », 12,5 → « 12,50 € ». */
function formaterMontant(prix: number): string {
  const [entier = "0", decimales] = (Number.isInteger(prix) ? String(prix) : prix.toFixed(2)).split(
    ".",
  );
  const groupes = entier.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
  return `${decimales ? `${groupes},${decimales}` : groupes}\u00a0€`;
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
  /**
   * Pourquoi l'analyse par IA n'a pas été utilisée. `detail` : la précision technique, montrée par
   * défaut (variables manquantes, code HTTP) ; elle ne contient jamais de valeur secrète ni de
   * contenu utilisateur (`technique` est une liste de variables, un code HTTP ou des champs).
   * `public` : phrase générale, montrée quand `SHOW_DIAGNOSTICS=false` (`null` : le message de
   * forte affluence suffit).
   */
  diagnostic: {
    ia_non_configuree: {
      public: "L'analyse par IA n'est pas activée sur ce service.",
      detail: (technique?: string) =>
        `Variable(s) d'environnement manquante(s) : ${technique || "ANTHROPIC_API_KEY"}. L'analyse par IA reste désactivée tant qu'elles ne sont pas définies.`,
    },
    stockage_non_partage: {
      public: "L'analyse par IA est désactivée : le service n'est pas entièrement configuré.",
      detail: (technique?: string) =>
        `Variable(s) d'environnement manquante(s) : ${technique || "UPSTASH_REDIS_REST_URL (ou KV_REST_API_URL), UPSTASH_REDIS_REST_TOKEN (ou KV_REST_API_TOKEN)"}. Sans stockage partagé, le rate limit et le plafond de dépense ne sont pas fiables : l'IA reste coupée.`,
    },
    secret_manquant: {
      public: "L'analyse par IA est désactivée : le service n'est pas entièrement configuré.",
      detail: (technique?: string) =>
        `Variable(s) d'environnement manquante(s) : ${technique || "IP_HASH_SECRET"}. Sans secret pour hasher les IP, l'IA reste coupée.`,
    },
    stockage_indisponible: {
      public: "L'analyse par IA est suspendue : un service interne est momentanément indisponible.",
      detail: () =>
        "Le stockage (Upstash) est injoignable : rate limit et plafond de dépense inopérants, l'IA est coupée le temps de la panne.",
    },
    plafond_atteint: {
      public: null,
      detail: () =>
        "Plafond de dépense quotidien atteint (DAILY_SPEND_CAP_USD) : l'IA est coupée jusqu'à minuit UTC.",
    },
    ia_echec_indisponible: {
      public: "Le service d'IA est momentanément indisponible.",
      detail: (technique?: string) =>
        `Anthropic est injoignable ou surchargé${technique ? ` : ${technique}` : ""}.`,
    },
    ia_echec_configuration: {
      public: "Le service d'IA a refusé la requête : le service n'est pas correctement configuré.",
      detail: (technique?: string) =>
        `Anthropic a refusé la requête${technique ? ` : ${technique}` : ""}. Vérifie ANTHROPIC_API_KEY, ANTHROPIC_MODEL et le format de sortie demandé (output_config.format).`,
    },
    ia_echec_delai: {
      public: "Le service d'IA n'a pas répondu à temps.",
      detail: () => "Anthropic n'a pas répondu dans le délai (ANTHROPIC_TIMEOUT_MS).",
    },
    ia_echec_refus: {
      public: "Le service d'IA n'a pas pu traiter ce contenu.",
      detail: (technique?: string) =>
        `Le modèle a refusé de répondre${technique ? ` : ${technique}` : ""}.`,
    },
    ia_echec_tronquee: {
      public: "Le service d'IA a renvoyé une réponse inexploitable.",
      detail: () =>
        "La réponse du modèle a été coupée avant la fin (ANTHROPIC_MAX_TOKENS trop bas ?).",
    },
    ia_echec_reponse_invalide: {
      public: "Le service d'IA a renvoyé une réponse inexploitable.",
      detail: (technique?: string) =>
        `La réponse du modèle n'a pas la forme attendue${technique ? ` : ${technique}` : ""}.`,
    },
  } satisfies Record<
    CodeDiagnostic,
    { public: string | null; detail: (technique?: string) => string }
  >,

  /** Lien d'annonce collé : son contenu n'est pas encore lu. */
  lienAnnonce: {
    titre: "Lecture d'annonce bientôt disponible",
    sites: {
      vinted: "Vinted",
      leboncoin: "Leboncoin",
      facebook_marketplace: "Facebook Marketplace",
    } satisfies Record<Exclude<Plateforme, "autre">, string>,
    // Les messages ne répètent pas le titre : l'interface l'affiche au-dessus.
    erreur: (site: string) =>
      `On ne lit pas encore le contenu d'un lien ${site}. Envoie plutôt une capture de l'annonce, ou colle son texte.`,
    avis: (site: string) =>
      `Le lien ${site} n'a pas été lu. L'analyse s'appuie sur ce que tu as envoyé d'autre.`,
    /** Sous le champ lien, dès qu'une annonce d'un site connu y est collée. */
    note: (site: string) =>
      `Ce lien ${site} ne sera pas lu. Ajoute une capture ou colle le texte de l'annonce : on analyse quand même ce que tu envoies.`,
    autreLien:
      "On ne lit pas encore le contenu des liens. L'adresse elle-même ne présente aucun signal d'alerte, mais cela ne dit rien de la page. Envoie une capture de l'annonce, ou colle son texte.",
  },
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
    /** Signaux tirés de la comparaison à une estimation de prix en ligne (voir `fr.prix`). */
    prixWeb: {
      tresBas:
        "Le prix demandé est très inférieur à ce qu'on voit d'habitude en occasion pour cet article : moins de 40 % du bas de la fourchette estimée.",
      bas: "Le prix demandé est nettement inférieur à ce qu'on voit d'habitude en occasion pour cet article : entre 40 et 60 % du bas de la fourchette estimée.",
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
    ia_indisponible:
      "On ne peut pas lire les captures pour le moment. Colle plutôt le texte de la conversation (ça marche sans), ou réessaie plus tard.",
    analyse_impossible:
      "On n'a pas réussi à lire cette capture. Essaie avec une capture plus nette, ou colle le texte de la conversation.",
    lien_non_recuperable:
      "On n'a pas pu récupérer cette annonce. Envoie plutôt une capture de l'annonce.",
    vote_impossible:
      "Ce vote n'a pas pu être enregistré : il a déjà été donné, ou ce résultat est trop ancien.",
    comparaison_impossible:
      "La comparaison de prix n'est plus possible pour ce résultat (trop ancien, ou article non identifié avec assez de certitude). Relance une vérification.",
    erreur_interne: "Quelque chose s'est mal passé de notre côté. Réessaie dans un instant.",
  } satisfies Record<CodeErreur, string>,

  /**
   * Comparaison de prix. Ce sont des estimations, tirées d'une recherche en ligne : le wording
   * reste prudent (« estimé », « habituel »), et un prix bas n'est jamais présenté comme une preuve.
   */
  prix: {
    titre: "Prix",
    bouton: "Comparer le prix",
    aide: "On compare ce prix à ceux du neuf et de l'occasion, grâce à une recherche en ligne (une dizaine de secondes).",
    enCours: "Recherche des prix en cours…",
    estimation: "Estimation",
    neuf: (prix: number) => `Prix neuf estimé ~${formaterMontant(prix)}`,
    occasion: (min: number, max: number) =>
      `Occasion habituelle ~${formaterMontant(min).replace("\u00a0€", "")}–${formaterMontant(max)}`,
    ecart: (pourcentage: number, prixAnnonce: number) =>
      pourcentage < 0
        ? `Cette annonce (${formaterMontant(prixAnnonce)}) est à −${Math.abs(pourcentage)} % du prix d'occasion habituel`
        : pourcentage === 0
          ? `Cette annonce (${formaterMontant(prixAnnonce)}) est au prix d'occasion habituel`
          : `Cette annonce (${formaterMontant(prixAnnonce)}) est à +${pourcentage} % du prix d'occasion habituel`,
    article: (nom: string) => `Article retenu : ${nom}`,
    mention:
      "Estimation tirée de recherches en ligne : un ordre de grandeur, pas un prix garanti. Un prix bas peut aussi venir d'un article abîmé, incomplet ou mal identifié.",
    sources: "Sources consultées",
    introuvable:
      "On n'a pas trouvé assez de prix comparables pour cet article : aucune comparaison possible.",
    peuFiable:
      "Estimation peu sûre : elle ne modifie pas le score. Vérifie le prix toi-même avant de t'y fier.",
    confiance: {
      haute: "Estimation assez sûre",
      moyenne: "Estimation à prendre avec prudence",
      basse: "Estimation peu sûre",
    },
    scoreMisAJour: "Le score a été mis à jour avec ce prix.",
    ancienSignal: "Remplace l'estimation approximative faite à partir de la marque seule.",
    depuisCache: "Estimation récente, déjà calculée pour cet article.",
    erreur: "La comparaison de prix n'a pas abouti",
  },

  /**
   * Carte de partage (image 9:16 pour une story). Elle ne reprend JAMAIS le texte libre d'une
   * analyse : ni celui de l'IA (il peut citer un pseudo ou un message), ni les libellés des règles
   * (certains contiennent un prix exact ou un domaine). Chaque signal des règles a ici sa phrase
   * courte, sans aucune donnée de l'annonce ; un test impose une phrase pour chaque règle.
   */
  partage: {
    bouton: "Partager le résultat",
    preparation: "Préparation de l'image…",
    nomFichier: "gardo-resultat.png",
    accroche: "Vérifie tes annonces avant de payer",
    mention: "Estimation, aide à la décision",
    annonce: (site: string) => `Annonce ${site}`,
    ecartPrix: {
      sous: (pourcentage: number) => `−${pourcentage} % vs prix d'occasion habituel`,
      dans: "Prix dans la norme de l'occasion",
      au_dessus: (pourcentage: number) => `+${pourcentage} % vs prix d'occasion habituel`,
    },
    autresSignaux: (nombre: number) =>
      nombre === 1 ? "+ 1 autre signal" : `+ ${nombre} autres signaux`,
    /** Quand aucun signal des règles n'est montrable (analyse portée par l'IA seule, ou rien à signaler). */
    sansSignal: {
      faible: "Peu de signaux d'alerte repérés.",
      moyen: "Plusieurs points inhabituels repérés.",
      élevé: "Plusieurs points inhabituels repérés.",
    } satisfies Record<Niveau, string>,
    /** Règle sans phrase dédiée (ne devrait pas arriver : un test le vérifie). */
    signalParGravite: {
      info: "Un point à noter a été repéré.",
      attention: "Un point inhabituel a été repéré.",
      importante: "Un point important a été repéré.",
      critique: "Un signal d'alerte critique a été repéré.",
    } satisfies Record<Gravite, string>,
    /** Phrase courte par identifiant de règle ; deux formes quand la gravité change le sens. */
    signaux: {
      "plateforme.whatsapp": "On te propose de passer sur WhatsApp.",
      "plateforme.telegram": "On te propose de passer sur Telegram.",
      "plateforme.autre_reseau": "On te propose un autre réseau pour discuter.",
      "plateforme.hors_plateforme": "On te propose de sortir de la plateforme.",
      "plateforme.sms": "On te propose de continuer par SMS.",
      "plateforme.telephone": "Un numéro de téléphone est donné.",
      "plateforme.email": "Une adresse e-mail est donnée.",
      "paiement.virement": "Un paiement par virement est évoqué.",
      "paiement.paypal_proches": "PayPal « entre proches » est évoqué.",
      "paiement.paypal": "Un paiement PayPal hors plateforme est évoqué.",
      "paiement.lydia": "Un paiement par Lydia ou cagnotte est évoqué.",
      "paiement.cheque": "Un paiement par chèque est évoqué.",
      "paiement.acompte": "Un acompte est demandé avant réception.",
      "paiement.mandat_carte_cadeau": "Paiement demandé par mandat, carte cadeau ou crypto.",
      "paiement.coordonnees_bancaires": "Des informations de carte bancaire sont demandées.",
      "paiement.code_sms": "Un code reçu par SMS est demandé.",
      "script.paiement_effectue_lien": "Un lien est envoyé pour « recevoir » un paiement.",
      "script.faux_transporteur": "Un lien de livraison douteux est envoyé.",
      "script.frais_supplementaires": "Des frais supplémentaires sont demandés.",
      "script.paiement_securise_faux": "Un « paiement sécurisé » douteux est mis en avant.",
      "script.trop_percu": "On te demande de rembourser un trop-perçu.",
      "script.rembourse_apres": "On te demande d'avancer de l'argent.",
      "script.piece_identite": "Une pièce d'identité est demandée.",
      "urgence.forte": "On te met la pression pour aller vite.",
      "urgence.legere": "On te presse un peu pour aller vite.",
      "liens.externe": "Un lien vers un site externe est partagé.",
      "lien.sous_domaine_piege": "Un lien imite l'adresse d'un site connu.",
      "lien.identifiants_trompeurs": "Un lien cache sa vraie destination.",
      "lien.imitation_marque": "Un lien imite une marque ou une plateforme.",
      "lien.marque_sous_domaine": "Un lien utilise un nom de marque pour tromper.",
      "lien.typosquatting": "Un lien ressemble à une adresse connue.",
      "lien.marque_dans_chemin": "Un lien utilise un nom de marque pour tromper.",
      "lien.raccourci": "Un lien raccourci cache sa destination.",
      "lien.adresse_ip": "Un lien utilise une adresse numérique.",
      "lien.caracteres_inhabituels": "Un lien contient des caractères inhabituels.",
      "lien.tld_suspect": "Un lien a une terminaison d'adresse peu courante.",
      "lien.mots_appat": "Un lien contient des mots d'appât (paiement, colis…).",
      "lien.hebergement_ouvert": "Un lien mène vers une page hébergée en libre accès.",
      "lien.adresse_inhabituelle": "Un lien a une adresse inhabituelle.",
      "lien.domaine_recent": "Un lien mène vers un site très récent.",
      "profil.compte_tres_recent": "Le compte a été créé il y a moins d'une semaine.",
      "profil.compte_recent": "Le compte a été créé il y a moins d'un mois.",
      "profil.compte_assez_recent": "Le compte a été créé il y a moins de trois mois.",
      "profil.aucun_avis": "Le profil n'a encore aucun avis.",
      "profil.peu_d_avis": "Le profil n'a que quelques avis.",
      "profil.note_tres_basse": "La note du profil est très basse.",
      "profil.note_basse": "La note du profil est basse.",
      "profil.beaucoup_d_annonces": "Compte récent, mais déjà beaucoup d'annonces.",
      "profil.non_verifie": "Le profil n'est pas vérifié.",
      "annonce.une_photo": "L'annonce n'a qu'une seule photo.",
      "prix.tres_bas": "Le prix est très inférieur à l'habitude.",
      "prix.bas": "Le prix est inhabituellement bas.",
      "prix.web": "Le prix est très inférieur au marché de l'occasion.",
    } as Readonly<Record<string, string>>,
    /** « prix.web » en « attention » : formulation plus nuancée. */
    signauxNuances: {
      "prix.web": "Le prix est nettement inférieur au marché de l'occasion.",
    } as Readonly<Record<string, string>>,
    rassurants: {
      "profil.compte_ancien": "Le compte existe depuis longtemps.",
      "profil.compte_assez_ancien": "Le compte existe depuis plus d'un an.",
      "profil.nombreux_avis": "Le profil a de nombreux avis.",
      "profil.plusieurs_avis": "Le profil a plusieurs avis positifs.",
      "profil.verifie": "Le profil est vérifié par la plateforme.",
      "plateforme.paiement": "Le paiement passe par la plateforme.",
    } as Readonly<Record<string, string>>,
    statut: {
      enregistree: "Image enregistrée sur cet appareil.",
      erreur: "L'image n'a pas pu être créée. Réessaie dans un instant.",
    },
    apercu: {
      titre: "Enregistre ton image",
      aide: "Garde ton doigt appuyé sur l'image, puis choisis « Ajouter à Photos » (ou « Enregistrer »). Tu pourras ensuite la poster en story.",
      fermer: "Fermer",
      alt: "Aperçu de la carte de partage",
    },
    texte: (hote: string) => `Vérifie tes annonces avant de payer → ${hote}`,
  },

  /** Interface : écran de saisie, chargement, résultat. */
  ui: {
    tagline: "Les signaux d'alerte d'une annonce, en quelques secondes.",
    plateformes: "Vinted, Leboncoin, Facebook Marketplace…",
    sansJavascript: `${APP_NAME} a besoin de JavaScript pour fonctionner.`,
    cta: "Vérifier une annonce",
    ctaAide: "Ajoute une capture, un texte ou un lien pour commencer.",
    ctaTraitement: "Préparation des captures…",
    confidentialite: `${APP_NAME} ne conserve ni tes captures ni tes messages.`,
    captures: {
      titre: "Captures d'écran",
      ajouter: "Ajouter des captures",
      ajouterEncore: "Ajouter une capture",
      aide: `Jusqu'à ${MAX_IMAGES} : l'annonce, le profil du vendeur, la conversation.`,
      deposer: "Dépose tes captures ici",
      retirer: (numero: number) => `Retirer la capture ${numero}`,
      alt: (numero: number) => `Capture ${numero}`,
      tropDImages: `Tu peux envoyer jusqu'à ${MAX_IMAGES} captures à la fois.`,
      illisible:
        "Une image n'a pas pu être lue. Essaie avec une capture d'écran au format JPEG, PNG ou WebP.",
      tropLourde: "Une image est trop lourde, même réduite. Essaie avec une capture plus petite.",
    },
    texte: {
      ouvrir: "Coller un texte ou un lien",
      fermer: "Masquer le texte et le lien",
      labelTexte: "Texte de l'annonce ou de la conversation",
      placeholderTexte: "Colle ici la description de l'annonce ou les messages du vendeur",
      labelLien: "Lien",
      placeholderLien: "https://…",
      aideLien:
        "On vérifie si une adresse est suspecte. Le contenu d'une annonce n'est pas lu à partir d'un lien.",
    },
    site: {
      titre: "Sur quel site est l'annonce ?",
      options: {
        vinted: "Vinted",
        leboncoin: "Leboncoin",
        facebook_marketplace: "Marketplace",
        autre: "Autre",
      } satisfies Record<Plateforme, string>,
      aide: "Ça règle la prudence : payer ou discuter en dehors de l'appli est un signal fort sur Vinted. « Autre » applique les règles les plus strictes.",
    },
    diagnostic: "Pourquoi ?",
    chargement: {
      titre: "Vérification en cours",
      etapes: [
        "On lit ce que tu as envoyé…",
        "On cherche les signaux d'alerte…",
        "On prépare ton résultat…",
      ],
      patience: "Ça prend quelques secondes.",
      annuler: "Annuler",
    },
    resultat: {
      score: "Score de risque",
      sur100: "sur 100",
      recommencer: "Vérifier une autre annonce",
      scoreLu: (score: number, niveau: string) =>
        `Score de risque : ${score} sur 100, ${niveau.toLowerCase()}.`,
    },
    erreur: {
      titre: "La vérification n'a pas abouti",
      reseau: "La connexion a échoué. Vérifie ton réseau et réessaie.",
      delai: "La vérification prend trop de temps. Réessaie dans un instant.",
      inattendue: "On n'a pas compris la réponse du service. Réessaie dans un instant.",
      collerTexte: "Coller le texte à la place",
      limite: (delai: string) =>
        `Tu as fait beaucoup de vérifications en peu de temps. Tu pourras en refaire dans environ ${delai}.`,
    },
    feedbackEchec: "Ton avis n'a pas pu être envoyé. Réessaie dans un instant.",
  },

  /** Précisions pour les erreurs de validation : remplacent le message générique du code. */
  erreursPrecises: {
    tropDImages: `Tu peux envoyer jusqu'à ${MAX_IMAGES} captures à la fois.`,
    imageTropLourde:
      "Une des captures est trop lourde. Envoie-la en plus petit ou recadre la partie utile.",
    requeteTropVolumineuse:
      "Les captures envoyées sont trop volumineuses. Envoie-en moins ou en plus petit.",
    corpsIllisible: "On n'a pas pu lire ta demande. Réessaie en renvoyant les captures.",
    prixAffluence:
      "Forte affluence : la comparaison de prix est suspendue pour le moment. Réessaie plus tard.",
    prixIndisponible: "La comparaison de prix n'est pas disponible pour le moment.",
    prixTropDeRecherches:
      "Tu as comparé beaucoup de prix en peu de temps. Réessaie dans quelques minutes.",
  },
} as const;
