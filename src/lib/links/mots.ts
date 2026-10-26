import { compacter } from "./similarite";

/**
 * Mots d'appât : vocabulaire du paiement, de la vérification et de la livraison qu'on
 * retrouve dans les adresses de faux sites. Sans accents ; `affichage` est ce qu'on
 * montre à l'utilisateur.
 */
const MOTS_APPAT_BRUTS: ReadonlyArray<{ mot: string; affichage: string }> = [
  { mot: "remboursement", affichage: "remboursement" },
  { mot: "verification", affichage: "vérification" },
  { mot: "confirmation", affichage: "confirmation" },
  { mot: "reclamation", affichage: "réclamation" },
  { mot: "livraison", affichage: "livraison" },
  { mot: "assistance", affichage: "assistance" },
  { mot: "paiement", affichage: "paiement" },
  { mot: "payment", affichage: "payment" },
  { mot: "securise", affichage: "sécurisé" },
  { mot: "securite", affichage: "sécurité" },
  { mot: "connexion", affichage: "connexion" },
  { mot: "confirmer", affichage: "confirmer" },
  { mot: "delivery", affichage: "delivery" },
  { mot: "tracking", affichage: "tracking" },
  { mot: "recevoir", affichage: "recevoir" },
  { mot: "reception", affichage: "réception" },
  { mot: "debloquer", affichage: "débloquer" },
  { mot: "encaisser", affichage: "encaisser" },
  { mot: "virement", affichage: "virement" },
  { mot: "valider", affichage: "valider" },
  { mot: "refund", affichage: "refund" },
  { mot: "retrait", affichage: "retrait" },
  { mot: "litige", affichage: "litige" },
  { mot: "secure", affichage: "secure" },
  { mot: "verif", affichage: "vérif" },
  { mot: "suivi", affichage: "suivi" },
  { mot: "colis", affichage: "colis" },
];

/** Du plus long au plus court, pour qu'un mot ne soit pas compté dans un mot plus long. */
const MOTS_APPAT = [...MOTS_APPAT_BRUTS].sort((a, b) => b.mot.length - a.mot.length);

export interface TrouvailleAppat {
  /** Mots trouvés, tels qu'on les affiche (sans doublon, du plus long au plus court). */
  mots: string[];
  /** Le texte compact privé des mots d'appât trouvés. */
  reste: string;
}

/**
 * Cherche les mots d'appât dans un texte (adresse, chemin…). Les mots plus longs sont
 * retirés en premier pour qu'un même passage ne compte pas deux fois (« verification »
 * ne déclenche pas aussi « verif »).
 */
export function chercherAppats(texte: string): TrouvailleAppat {
  let reste = compacter(texte);
  const mots: string[] = [];
  for (const { mot, affichage } of MOTS_APPAT) {
    if (reste.includes(mot)) {
      mots.push(affichage);
      reste = reste.split(mot).join("");
    }
  }
  return { mots, reste };
}

export function contientAppat(texte: string): boolean {
  return chercherAppats(texte).mots.length > 0;
}
