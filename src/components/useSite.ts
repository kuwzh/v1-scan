"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Plateforme } from "@/lib/contracts/extracted";

const CLE = "gardo:site";
const DEFAUT: Plateforme = "vinted";
const VALIDES: ReadonlySet<string> = new Set([
  "vinted",
  "leboncoin",
  "facebook_marketplace",
  "autre",
]);

/** Valeur de la visite en cours : sert aussi quand le stockage du navigateur est indisponible. */
let courant: Plateforme | null = null;
const ecouteurs = new Set<() => void>();

function lireMemorise(): Plateforme {
  try {
    const v = localStorage.getItem(CLE);
    return v && VALIDES.has(v) ? (v as Plateforme) : DEFAUT;
  } catch {
    return DEFAUT;
  }
}

const abonner = (fn: () => void) => {
  ecouteurs.add(fn);
  return () => void ecouteurs.delete(fn);
};

/**
 * Site choisi (Vinted par défaut), retenu sur cet appareil pour les prochaines visites. Rien
 * n'est envoyé ni stocké ailleurs. Le rendu serveur affiche toujours Vinted.
 */
export function useSite(): [Plateforme, (site: Plateforme) => void] {
  const site = useSyncExternalStore(
    abonner,
    () => courant ?? lireMemorise(),
    () => DEFAUT,
  );
  const choisir = useCallback((suivant: Plateforme) => {
    courant = suivant;
    try {
      localStorage.setItem(CLE, suivant);
    } catch {
      // Navigation privée : le choix vaut pour cette visite.
    }
    ecouteurs.forEach((fn) => fn());
  }, []);
  return [site, choisir];
}
