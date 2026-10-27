import type { Plateforme } from "../contracts/extracted";
import type { PrixResponse } from "../contracts/prix";
import type { Gravite, Rassurant, Signal } from "../contracts/signals";
import type { EntreeCarte } from "./carte";

/** Un pseudo, un prénom, un domaine et un prix exact : rien de tout cela ne doit atteindre la carte. */
export const PSEUDO = "marie_dupont75";
export const DOMAINE = "paypa1-livraison.xyz";
export const PRIX_EXACT = "45 €";

export const signal = (
  id: string,
  gravite: Gravite,
  label = `Libellé complet de ${id}`,
  source: Signal["source"] = "regle",
): Signal => ({ id, label, gravite, source });

export const rassurant = (
  id: string,
  label = `Libellé complet de ${id}`,
  source: Rassurant["source"] = "regle",
): Rassurant => ({ id, label, source });

export function entree(
  score: number,
  niveau: EntreeCarte["resultat"]["niveau"],
  options: {
    signaux?: Signal[];
    rassurants?: Rassurant[];
    plateforme?: Plateforme | null;
    site?: Plateforme | null;
    prix?: PrixResponse | null;
  } = {},
): EntreeCarte {
  return {
    resultat: {
      score,
      niveau,
      signaux: options.signaux ?? [],
      rassurants: options.rassurants ?? [],
      donnees_extraites: { plateforme: options.plateforme ?? null },
    },
    site: options.site ?? null,
    prix: options.prix ?? null,
    hote: "v1-scan.vercel.app",
  };
}

export function prixOk(ecartPct: number, fiable = true): PrixResponse {
  return {
    statut: "ok",
    estimation: null,
    comparaison: {
      prix_annonce_eur: 250,
      occasion_habituelle_eur: 900,
      ecart_pct: ecartPct,
      part_du_bas_pct: 36,
      fiable,
    },
    signal: null,
    resultat: { score: 41, niveau: "moyen", signaux_retires: [] },
    depuis_cache: false,
  };
}

/** Le cas le plus chargé : trois signaux longs, un rassurant, deux pastilles, des signaux en plus. */
export function entreeChargee(): EntreeCarte {
  return entree(88, "élevé", {
    plateforme: "facebook_marketplace",
    prix: prixOk(-65),
    signaux: [
      signal("paiement.mandat_carte_cadeau", "critique"),
      signal("script.paiement_effectue_lien", "critique"),
      signal("script.paiement_securise_faux", "importante"),
      signal("script.faux_transporteur", "importante"),
      signal("paiement.coordonnees_bancaires", "critique"),
      signal("lien.mots_appat", "attention"),
      signal("ia.1", "importante", `${PSEUDO} demande un paiement hors plateforme`, "ia"),
    ],
    rassurants: [rassurant("profil.verifie")],
  });
}
