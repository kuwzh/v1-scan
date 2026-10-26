import type { Stockage } from "./stockage";

const MICRO = 1_000_000;
const TTL_DEPENSE_S = 3 * 86_400;

const enMicro = (usd: number) => Math.max(1, Math.ceil(usd * MICRO));

/** Une journée de dépense, en UTC : le compteur repart à zéro à minuit UTC. */
export function cleDepense(date: Date): string {
  return `depense:${date.toISOString().slice(0, 10)}`;
}

export interface Reservation {
  cle: string;
  micro: number;
}

export type ResultatReservation = { ok: true; reservation: Reservation } | { ok: false };

/**
 * Réserve le coût maximal possible d'un appel IA AVANT de le faire. L'incrément est atomique :
 * si le total dépasse le plafond, la réservation est annulée et l'IA reste coupée. Même avec
 * des centaines d'appels simultanés, la dépense ne dépasse le plafond que de l'écart entre
 * une estimation et le coût réel, jamais du nombre d'appels en cours.
 */
export async function reserver(
  stockage: Stockage,
  options: { plafondUsd: number; estimationUsd: number; maintenant: Date },
): Promise<ResultatReservation> {
  if (options.plafondUsd <= 0) return { ok: false };
  const reservation = {
    cle: cleDepense(options.maintenant),
    micro: enMicro(options.estimationUsd),
  };
  const total = await stockage.incrementer(reservation.cle, reservation.micro, TTL_DEPENSE_S);
  if (total > Math.floor(options.plafondUsd * MICRO)) {
    await stockage.incrementer(reservation.cle, -reservation.micro);
    return { ok: false };
  }
  return { ok: true, reservation };
}

/**
 * Remplace la réservation par le coût réel. `null` : coût inconnu (ou appel peut-être facturé
 * malgré un délai dépassé), on garde la réservation, c'est le choix prudent.
 */
export async function regulariser(
  stockage: Stockage,
  reservation: Reservation,
  coutReelUsd: number | null,
): Promise<void> {
  if (coutReelUsd === null) return;
  const ecart = Math.ceil(coutReelUsd * MICRO) - reservation.micro;
  if (ecart !== 0) await stockage.incrementer(reservation.cle, ecart);
}

export async function lireDepenseDuJour(stockage: Stockage, date: Date): Promise<number> {
  return ((await stockage.lire(cleDepense(date))) ?? 0) / MICRO;
}
