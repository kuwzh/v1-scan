"use client";

import type { Plateforme } from "@/lib/contracts/extracted";
import { fr } from "@/lib/copy/fr";

const SITES: readonly Plateforme[] = ["vinted", "leboncoin", "facebook_marketplace", "autre"];

/**
 * Le site règle la prudence des règles : sur Vinted, payer ou discuter en dehors de l'appli est
 * un signal fort, moins sur Leboncoin. Vinted par défaut ; « Autre » applique les mêmes règles
 * strictes. Boutons radio natifs : utilisables au clavier et lus par les lecteurs d'écran.
 */
export function SelecteurSite({
  valeur,
  onChange,
}: {
  valeur: Plateforme;
  onChange: (site: Plateforme) => void;
}) {
  return (
    <fieldset>
      <legend className="font-medium">{fr.ui.site.titre}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {SITES.map((site) => (
          <label key={site} className="cursor-pointer">
            <input
              type="radio"
              name="site"
              value={site}
              checked={valeur === site}
              onChange={() => onChange(site)}
              className="peer sr-only"
            />
            <span className="flex h-11 items-center rounded-full border border-neutral-300 bg-white px-4 font-medium transition-colors peer-checked:border-indigo-600 peer-checked:bg-indigo-600 peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-indigo-600 dark:border-neutral-700 dark:bg-neutral-900 dark:peer-checked:border-indigo-500 dark:peer-checked:bg-indigo-500">
              {fr.ui.site.options[site]}
            </span>
          </label>
        ))}
      </div>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{fr.ui.site.aide}</p>
    </fieldset>
  );
}
