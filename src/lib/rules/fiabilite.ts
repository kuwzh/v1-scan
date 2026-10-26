import type { ExtractedData } from "../contracts/extracted";

export interface DonneesFiables {
  donnees: ExtractedData;
  /** Chemins des données écartées parce que l'IA les a lues avec une confiance basse. */
  ignorees: string[];
}

/**
 * Retire des données lues par l'IA tout ce qu'elle a signalé comme peu sûr (confiance
 * « basse ») : la donnée repasse à `null` et le message disparaît. Les règles ne voient que
 * ce résultat, pour qu'un chiffre mal lu (« 4,5 » pris pour « 45 ») ou une date incertaine
 * ne produise ni signal ni rassurant. Les confiances « haute » et « moyenne » comptent.
 */
export function donneesFiables(donnees: ExtractedData): DonneesFiables {
  const copie = structuredClone(donnees);
  const ignorees: string[] = [];

  for (const groupe of ["annonce", "vendeur"] as const) {
    const valeurs: Record<string, unknown> = copie[groupe];
    const confiances: Record<string, string | null> = copie.confiance[groupe];
    for (const cle of Object.keys(valeurs)) {
      if (confiances[cle] === "basse" && valeurs[cle] !== null) {
        valeurs[cle] = null;
        ignorees.push(`${groupe}.${cle}`);
      }
    }
  }

  copie.messages = copie.messages.filter((message, index) => {
    if (message.confiance !== "basse") return true;
    ignorees.push(`messages[${index}]`);
    return false;
  });

  return { donnees: copie, ignorees };
}
