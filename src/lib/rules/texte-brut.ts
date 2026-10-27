import { normaliserTexte } from "./texte";

/**
 * « Moi : … » : l'utilisateur lui-même, dont les messages ne sont jamais analysés. « Acheteur : »
 * n'est volontairement pas reconnu : si l'utilisateur est le vendeur (arnaque au chèque, au
 * trop-perçu), c'est son interlocuteur qui s'étiquette ainsi, et c'est justement lui qu'il faut lire.
 */
const ETIQUETTE_ACHETEUR = /^\s*(?:moi|me)\s*[:：]/i;

/**
 * Texte brut collé par l'utilisateur, débarrassé de ce que dit l'acheteur, pour servir de filet
 * aux règles : si l'IA a oublié un message du vendeur (ou n'a pas lu le texte), les règles le
 * voient quand même.
 *
 * On retire :
 * - les lignes étiquetées « Moi : » ;
 * - les lignes qui sont, pour l'essentiel, un message que l'IA a attribué à l'acheteur
 *   (`messagesAcheteur`) : sans quoi une question comme « Tu acceptes PayPal ? » posée par
 *   l'acheteur serait prise pour une demande du vendeur.
 *
 * Une ligne n'est retirée que si elle ressemble vraiment à un message de l'acheteur : une ligne du
 * vendeur qui en contient un court (« oui d'accord, paiement PayPal ») est conservée.
 */
export function retirerLignesAcheteur(
  texte: string,
  messagesAcheteur: readonly string[] = [],
): string {
  const acheteur = messagesAcheteur.map(normaliserTexte).filter((m) => m.length >= 3);
  return texte
    .split(/\r?\n/)
    .filter((ligne) => {
      if (ETIQUETTE_ACHETEUR.test(ligne)) return false;
      const n = normaliserTexte(ligne);
      if (n === "") return true;
      return !acheteur.some(
        (m) =>
          n === m ||
          (n.includes(m) && m.length >= 0.7 * n.length) ||
          (n.length >= 12 && m.includes(n)),
      );
    })
    .join("\n");
}
