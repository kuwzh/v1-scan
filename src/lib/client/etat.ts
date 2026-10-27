import type { AnalyzeResponse } from "../contracts/api";
import type { ErreurAffichee } from "./api";

/**
 * Les trois écrans de l'application. Les données saisies (captures, texte, lien) vivent à part :
 * une erreur ne doit rien faire perdre à l'utilisateur.
 */
export type Vue =
  | { nom: "saisie"; erreur: ErreurAffichee | null }
  | { nom: "envoi"; id: number }
  | { nom: "resultat"; reponse: AnalyzeResponse };

export type Action =
  | { type: "envoyer"; id: number }
  | { type: "reussi"; id: number; reponse: AnalyzeResponse }
  | { type: "echec"; id: number; erreur: ErreurAffichee }
  | { type: "annuler"; id: number }
  | { type: "effacerErreur" }
  | { type: "recommencer" };

export const VUE_INITIALE: Vue = { nom: "saisie", erreur: null };

/**
 * Chaque envoi porte un numéro : la réponse d'un envoi annulé ou remplacé qui arrive en retard
 * est ignorée, elle ne doit pas faire réapparaître un résultat que l'utilisateur a quitté.
 */
export function reduire(vue: Vue, action: Action): Vue {
  switch (action.type) {
    case "envoyer":
      return vue.nom === "saisie" ? { nom: "envoi", id: action.id } : vue;
    case "reussi":
      return vue.nom === "envoi" && vue.id === action.id
        ? { nom: "resultat", reponse: action.reponse }
        : vue;
    case "echec":
      return vue.nom === "envoi" && vue.id === action.id
        ? { nom: "saisie", erreur: action.erreur }
        : vue;
    case "annuler":
      return vue.nom === "envoi" && vue.id === action.id ? VUE_INITIALE : vue;
    case "effacerErreur":
      return vue.nom === "saisie" && vue.erreur ? VUE_INITIALE : vue;
    case "recommencer":
      return vue.nom === "envoi" ? vue : VUE_INITIALE;
  }
}
