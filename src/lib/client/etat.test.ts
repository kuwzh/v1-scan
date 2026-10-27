import { describe, expect, it } from "vitest";
import type { AnalyzeResponse } from "../contracts/api";
import type { ErreurAffichee } from "./api";
import { VUE_INITIALE, reduire, type Vue } from "./etat";

const reponse = { analyse_id: "id", resultat: { score: 10 } } as unknown as AnalyzeResponse;
const erreur: ErreurAffichee = { code: "reseau", message: "x", proposerTexte: false };

describe("reduire", () => {
  it("saisie → envoi → résultat", () => {
    let vue: Vue = VUE_INITIALE;
    vue = reduire(vue, { type: "envoyer", id: 1 });
    expect(vue).toEqual({ nom: "envoi", id: 1 });
    vue = reduire(vue, { type: "reussi", id: 1, reponse });
    expect(vue).toEqual({ nom: "resultat", reponse });
  });

  it("une erreur ramène à la saisie en gardant l'erreur à afficher", () => {
    const vue = reduire({ nom: "envoi", id: 1 }, { type: "echec", id: 1, erreur });
    expect(vue).toEqual({ nom: "saisie", erreur });
  });

  it("annuler ramène à la saisie sans erreur", () => {
    expect(reduire({ nom: "envoi", id: 1 }, { type: "annuler", id: 1 })).toEqual(VUE_INITIALE);
  });

  it("la réponse tardive d'un envoi annulé est ignorée", () => {
    let vue: Vue = reduire(VUE_INITIALE, { type: "envoyer", id: 1 });
    vue = reduire(vue, { type: "annuler", id: 1 });
    expect(reduire(vue, { type: "reussi", id: 1, reponse })).toEqual(VUE_INITIALE);
    expect(reduire(vue, { type: "echec", id: 1, erreur })).toEqual(VUE_INITIALE);
  });

  it("la réponse d'un ancien envoi ne remplace pas l'envoi en cours", () => {
    let vue: Vue = reduire(VUE_INITIALE, { type: "envoyer", id: 1 });
    vue = reduire(vue, { type: "annuler", id: 1 });
    vue = reduire(vue, { type: "envoyer", id: 2 });
    expect(reduire(vue, { type: "reussi", id: 1, reponse })).toEqual({ nom: "envoi", id: 2 });
    expect(reduire(vue, { type: "echec", id: 1, erreur })).toEqual({ nom: "envoi", id: 2 });
    expect(reduire(vue, { type: "annuler", id: 1 })).toEqual({ nom: "envoi", id: 2 });
  });

  it("on ne peut pas lancer un second envoi pendant un envoi, ni depuis un résultat", () => {
    expect(reduire({ nom: "envoi", id: 1 }, { type: "envoyer", id: 2 })).toEqual({
      nom: "envoi",
      id: 1,
    });
    const resultat: Vue = { nom: "resultat", reponse };
    expect(reduire(resultat, { type: "envoyer", id: 2 })).toBe(resultat);
  });

  it("recommencer ramène à la saisie depuis un résultat ou une erreur, mais pas pendant un envoi", () => {
    expect(reduire({ nom: "resultat", reponse }, { type: "recommencer" })).toEqual(VUE_INITIALE);
    expect(reduire({ nom: "saisie", erreur }, { type: "recommencer" })).toEqual(VUE_INITIALE);
    const envoi: Vue = { nom: "envoi", id: 3 };
    expect(reduire(envoi, { type: "recommencer" })).toBe(envoi);
  });

  it("effacerErreur ne touche que l'écran de saisie", () => {
    expect(reduire({ nom: "saisie", erreur }, { type: "effacerErreur" })).toEqual(VUE_INITIALE);
    const resultat: Vue = { nom: "resultat", reponse };
    expect(reduire(resultat, { type: "effacerErreur" })).toBe(resultat);
  });
});
