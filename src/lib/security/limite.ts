import type { Stockage } from "./stockage";

export interface Limites {
  parHeure: number;
  parJour: number;
}

export type ResultatDebit =
  { ok: true } | { ok: false; portee: "heure" | "jour"; reessayerDansS: number };

const FENETRES = [
  { nom: "heure", dureeS: 3_600 },
  { nom: "jour", dureeS: 86_400 },
] as const;

/**
 * Limite le débit par visiteur (`cle` : IP hashée) sur deux fenêtres glissantes, une heure et
 * un jour. Fenêtre glissante approchée : on compte la fenêtre en cours plus la part de la
 * précédente qui chevauche encore l'intervalle, ce qui évite le double quota à la frontière
 * de deux fenêtres fixes.
 *
 * Une demande refusée n'est pas comptée : un visiteur bloqué retrouve son quota dès que
 * ses anciennes demandes sortent de la fenêtre, quoi qu'il tente entre-temps.
 *
 * `prefixe` sépare les compteurs de deux usages (analyse, feedback).
 */
export async function verifierDebit(
  stockage: Stockage,
  cle: string,
  limites: Limites,
  maintenantMs: number,
  prefixe = "analyse",
): Promise<ResultatDebit> {
  const maintenantS = maintenantMs / 1000;
  const mesures = await Promise.all(
    FENETRES.map(async ({ nom, dureeS }) => {
      const indice = Math.floor(maintenantS / dureeS);
      const base = `limite:${prefixe}:${nom}:${cle}:`;
      const [courant, precedent] = await Promise.all([
        stockage.incrementer(`${base}${indice}`, 1, dureeS * 2),
        stockage.lire(`${base}${indice - 1}`),
      ]);
      const ecoule = (maintenantS % dureeS) / dureeS;
      const estimation = (precedent ?? 0) * (1 - ecoule) + courant;
      const limite = nom === "heure" ? limites.parHeure : limites.parJour;
      return {
        nom,
        cleCourante: `${base}${indice}`,
        depasse: estimation > limite,
        reessayerDansS: Math.max(1, Math.ceil(dureeS - (maintenantS % dureeS))),
      };
    }),
  );

  const depassees = mesures.filter((m) => m.depasse);
  if (depassees.length === 0) return { ok: true };

  await Promise.all(mesures.map((m) => stockage.incrementer(m.cleCourante, -1)));
  // La portée la plus longue : c'est elle qui décide quand réessayer.
  const pire = depassees.reduce((a, b) => (b.reessayerDansS > a.reessayerDansS ? b : a));
  return { ok: false, portee: pire.nom, reessayerDansS: pire.reessayerDansS };
}
