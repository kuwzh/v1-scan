import { fr } from "../../copy/fr";
import { constat } from "../poids";
import { evaluerPrix } from "../prix";
import type { Regle } from "../types";

/** Contenu de l'annonce : prix par rapport à la marque, nombre de photos. */
export const reglesAnnonce: Regle[] = [
  { nom: "prix", evaluer: (ctx) => evaluerPrix(ctx.donnees) },
  {
    nom: "photos",
    evaluer: (ctx) => {
      const { nombre_photos: photos, prix_eur: prix } = ctx.donnees.annonce;
      return photos === 1 && prix !== null && prix >= 150
        ? [constat("annonce.une_photo", fr.regles.annonce.unePhoto, "info", 0.08)]
        : [];
    },
  },
];
