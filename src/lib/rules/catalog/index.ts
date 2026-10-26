import type { Regle, RegleRassurante } from "../types";
import { reglesAnnonce } from "./annonce";
import { reglesLiens } from "./liens";
import { reglesPaiement } from "./paiement";
import { reglesPlateforme } from "./plateforme";
import { reglesRassurantes, reglesProfil } from "./profil";
import { reglesScripts } from "./scripts";
import { reglesUrgence } from "./urgence";

/** Toutes les règles qui produisent des signaux d'alerte. */
export const CATALOGUE: readonly Regle[] = [
  ...reglesPlateforme,
  ...reglesPaiement,
  ...reglesScripts,
  ...reglesUrgence,
  ...reglesLiens,
  ...reglesProfil,
  ...reglesAnnonce,
];

/** Règles qui produisent des éléments rassurants. */
export const CATALOGUE_RASSURANTS: readonly RegleRassurante[] = reglesRassurantes;
