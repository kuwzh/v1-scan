/**
 * Motifs appliqués au texte normalisé (minuscules, sans accents, apostrophes droites).
 * Chaque motif est documenté par ce qu'il doit reconnaître ; les tests couvrent les cas
 * qui doivent passer et ceux qui ne doivent pas passer.
 */
export const MOTIFS = {
  // --- Sortie de plateforme -------------------------------------------------------------
  whatsapp: /\b(?:whats?\s?app|whatsap|watsap+|whatapp|wtsp)\b/,
  telegram: /\b(?:telegram|telegramme|telegrame)\b|\bt\.me\b/,
  autreReseau:
    /\b(?:instagram|insta|snapchat|snap|messenger|viber|wechat|discord)\b|\b(?:sur|via|par|appli(?:cation)?)\s+signal\b/,
  sms: /\b(?:par|en|via|un|une|des|mon|ton)\s+(?:sms|texto|mms)\b|\b(?:envoie|envoyez|ecris|ecrivez|contacte|contactez|appelle|appelez)\w*\b[^.!?\n]{0,25}\b(?:sms|texto)\b/,
  telephoneFr: /(?:\+33|0033)\s?[1-9](?:[\s.\-]?\d{2}){4}\b|\b0[1-9](?:[\s.\-]?\d{2}){4}\b/,
  telephoneIntl: /\+(?!33)\d{1,3}[\s.\-]?\d(?:[\s.\-]?\d){7,11}\b/,
  email: /[a-z0-9._%+\-]{2,}@[a-z0-9.\-]+\.[a-z]{2,}/,
  emailMention:
    /\b(?:par|via|sur)\s+(?:e-?mail|mail|mel|courriel)\b|\b(?:mon|ma)\s+(?:adresse\s+)?(?:e-?mail|mail|gmail|courriel)\b/,
  horsPlateforme:
    /\b(?:en dehors|hors)\s+(?:de\s+)?(?:l'|la\s+)?(?:vinted|leboncoin|plateforme|appli(?:cation)?|site)\b|\bsans passer par\s+(?:l'|la\s+)?(?:vinted|leboncoin|plateforme|appli(?:cation)?|site)\b|\bpas besoin de passer par\b|\b(?:evite|evitons|evitez|eviter)\s+(?:les\s+)?(?:frais|commissions?)\b/,

  // --- Paiement -------------------------------------------------------------------------
  virement: /\b(?:virements?|virer|virez|iban|rib)\b|\bfr\d{2}(?:\s?\d{4}){2,}/,
  /**
   * Indices d'une vente en direct (espèces, remise en main propre) : un virement proposé à côté
   * décrit une vente locale, pas une sortie de plateforme. « cash » est volontairement absent :
   * « mandat cash » est un moyen de paiement à risque.
   */
  venteLocale: /\b(?:especes|liquide|main propre|a la remise|sur place|main a la main|en direct)\b/,
  paypal: /\bpay\s?pal\b|\bpaypa1\b/,
  paypalProches: /\b(?:proches?|amis|famille|friends|family|entre amis|f ?& ?f)\b/,
  lydia:
    /\b(?:par|via|sur|avec|en)\s+(?:l'\s*)?(?:appli\s+)?lydia\b|\blydia\s+(?:pay|paiement)\b|\b(?:paiement|payer|paye|regler|virement)[^.!?\n]{0,25}\blydia\b|\b(?:pot commun|cagnotte)\b/,
  cheque: /\b(?:par|en|un|ton|votre)\s+cheques?\b|\bpaiement[^.!?\n]{0,15}\bcheques?\b/,
  mandatCarteCadeau:
    /\bmandat\s+(?:cash|postal|international|minute|compte)\b|\bwestern\s?union\b|\bmoneygram\b|\bneosurf\b|\btranscash\b|\bpaysafe\s?card\b|\bukash\b|\bcartes?\s+(?:cadeau|prepayee|google\s+play|itunes|apple)\b|\brecharges?\s+pcs\b|\bpcs\s+mastercard\b|\bticket\s+pcs\b/,
  crypto:
    /\b(?:paiement|payer|paye|regler|reglement)[^.!?\n]{0,30}\b(?:bitcoin|btc|usdt|crypto\w*)\b|\b(?:bitcoin|btc|usdt|crypto\w*)[^.!?\n]{0,20}\b(?:uniquement|seulement|accepte)\b/,
  acompte: /\b(?:acompte|arrhes)\b|\bpour (?:le |la )?reserver[^.!?\n]{0,40}(?:€|euros?)/,
  carteBancaire:
    /\b(?:numero|n°|num)\s+(?:de\s+)?(?:ta\s+|votre\s+|la\s+)?carte(?!\s+(?:d'|de\s+(?:sejour|fidelite|visite)|vitale|grise|nationale|sim|electorale|pro\b|mere|graphique|son|memoire|sd\b|microsd))\b|\bcryptogramme\b|\bcvv\b|\bcvc\b|\bdate\s+d'expiration\b|\b(?:infos?|informations?|coordonnees?|details?)\s+(?:de\s+)?(?:ta\s+|votre\s+)?(?:carte(?!\s+(?:d'|de\s+(?:sejour|fidelite|visite)|vitale|grise|nationale|sim|electorale|pro\b|mere|graphique|son|memoire|sd\b|microsd))|bancaires?)\b|\bphoto\s+de\s+(?:ta|votre)\s+carte\s+(?:bancaire|bleue|de credit|visa|mastercard)\b|\bcode\s+au\s+dos\b/,
  codeSensible:
    /\bcode(?!\s+(?:postal|promo|barre|couleur|de suivi|suivi|de reduction|ean|produit|article|parrainage|tva|erreur|de la route|source|vestimentaire))[^.!?\n]{0,40}\b(?:sms|recu|recev\w*|envoye|verification|confirmation|securite|3d ?secure|otp)\b|\b(?:sms|mail)\b[^.!?\n]{0,25}\bcode\b|\bcode\s+(?:a\s+)?\d\s*chiffres\b|\botp\b/,
  /** Verbes par lesquels on demande de donner quelque chose. */
  verbeDemande:
    /\b(?:env(?:oi|oy)\w*|donn\w*|communiqu\w*|transmet\w*|fourni\w*|indiqu\w*|saisi\w*|renseign\w*|dict\w*|partag\w*|montr\w*)\b/,
  pieceIdentite:
    /\b(?:carte d'identite|piece d'identite|cni|passeport|permis de conduire|justificatif d'identite|selfie avec)\b/,
  photoOuScan: /\b(?:photo|scan|copie|recto|selfie|env(?:oi|oy)\w*|transmet\w*|fourni\w*)\b/,

  // --- Scripts connus -------------------------------------------------------------------
  paiementEffectue:
    /\b(?:j'ai|je viens de|je t'ai|jai)\s+(?:deja\s+|bien\s+)?(?:paye|effectue\s+(?:le|ton|mon)\s+paiement|vire|regle)\b|\bpaiement\s+(?:effectue|valide|envoye)\b|\b(?:argent|fonds|somme|paiement)\s+(?:est\s+|sont\s+)?(?:bloque|bloques|en attente|sequestre|disponible|a recuperer)\b|\bargent\s+t'attend\b/,
  /** Une consigne (cliquer, valider…) à propos de l'argent à recevoir. */
  actionRecevoir:
    /\b(?:clique|cliquez|clic|ouvre|ouvrez|suis|suivez|valide|validez|confirme|confirmez|connecte|connectez|accede|accedez|va sur|allez sur)\w*\b[^.!?\n]{0,60}\b(?:recevoir|recuperer|debloquer|encaisser|reclamer|argent|paiement|fonds)\b|\b(?:recevoir|recuperer|debloquer|encaisser|reclamer)\b[^.!?\n]{0,30}\b(?:argent|paiement|fonds|somme)\b/,
  /** Noms de transporteurs. « colis » seul n'en est pas un : tout le monde parle de colis. */
  transporteur:
    /\b(?:colissimo|mondial\s?relay|relais\s?colis|chronopost|dpd|ups|fedex|dhl|la poste|transporteur|coursier|livreur)\b/,
  fraisOuBlocage:
    /\b(?:frais|supplement|douane|dedouanement|taxes?|regler|debloquer|deblocage|reprogrammer|en attente|bloque|retenu|echec de livraison|adresse incomplete|non livre)\b/,
  fraisSupplementaires:
    /\bfrais\s+(?:de\s+|d'|du\s+)?(?:douane|dedouanement|assurance|dossier|deblocage|liberation|transit|stockage)\b|\btaxes?\s+(?:de\s+|d')?douane|\bdedouanement\b|\btransitaire\b/,
  paiementSecurise:
    /\bpaiement\s+(?:securise|certifie|garanti|protege|verifie)\b|\btransaction\s+securisee\b|\bprotection\s+(?:acheteur|vendeur|des achats)\b|\bservice\s+(?:de\s+)?(?:paiement|securisation|sequestre)\b|\b(?:vinted|leboncoin)\s+(?:pay|secure|securise|paiement|protect\w*)\b/,
  tropPercu:
    /(?:trop[- ]?percu|erreur de (?:montant|virement|saisie)|surplus|montant (?:superieur|trop eleve)|(?:envoye|vire|paye|verse)\w*[^.!?\n]{0,25}\b(?:de trop|en trop)|(?:virement|somme|montant|argent|paiement)[^.!?\n]{0,25}par erreur)[^.!?\n]{0,80}\b(?:rembours\w*|renvo\w*|renvoy\w*|retourn\w*|rend\w*)\b|\b(?:rembours\w*|renvo\w*|renvoy\w*|retourn\w*)[^.!?\n]{0,40}\b(?:difference|surplus|le trop|trop[- ]?percu)\b/,
  rembourseApres:
    /\bje\s+te\s+rembourse(?:rai)?\s+(?:apres|ensuite|des|plus tard|au retour)\b|\b(?:avance|avancer)\s+(?:les\s+)?(?:frais|la somme|l'argent)\b[^.!?\n]{0,40}\brembours/,

  // --- Urgence : chaque entrée est un « groupe » de formules --------------------------
  pression: [
    /\b(?:vite|rapidement|sans tarder|au plus vite|des que possible)\b/,
    /\b(?:urgent|urgence|derniere chance|dernier prix|dernier delai)\b/,
    /\b(?:tout de suite|immediatement|dans l'heure|dans l'instant|avant ce soir|avant demain|aujourd'hui seulement|que pour aujourd'hui|dans les 24 ?h)\b/,
    /\b(?:plusieurs|beaucoup de|d'autres)\s+(?:personnes|acheteurs|gens|offres?|interesse\w*)\b|\bquelqu'un d'autre\b|\bpremier (?:qui|a) (?:paie|paye|valide|confirme)\b|\bje (?:le )?vends? au premier\b|\bsinon je (?:le )?vends\b/,
    /\b(?:depeche|depechez|ne tarde pas|ne tardez pas|reponds vite|repondez vite|derniere occasion|offre (?:valable|expire))\b/,
  ],

  // --- Rassurants -----------------------------------------------------------------------
  paiementPlateforme:
    /\b(?:paiement|payer|achat|reglement)\s+(?:se fait\s+|se fera\s+|uniquement\s+|seulement\s+)?(?:via|par|avec|sur)\s+(?:l'\s*)?(?:vinted|leboncoin|la plateforme|l'appli(?:cation)?)\b|\bvinted go\b|\b(?:livraison|colis|envoi)\s+(?:via|par|avec)\s+(?:vinted|leboncoin|la plateforme)\b|\bpaiement\s+(?:vinted|leboncoin)\b/,
} as const;

/** Hôtes de liens qui font sortir de la plateforme. */
export const HOTES_WHATSAPP =
  /^(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|web\.whatsapp\.com|whatsapp\.com)$/;
export const HOTES_TELEGRAM = /^(?:t\.me|telegram\.me|telegram\.dog)$/;
