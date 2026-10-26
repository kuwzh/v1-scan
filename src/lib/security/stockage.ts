/**
 * Stockage clé-valeur minimal dont les garde-fous ont besoin. Il est abstrait pour que la
 * production utilise Upstash Redis, le développement et les tests une mémoire locale, et
 * qu'un autre fournisseur puisse un jour le remplacer sans toucher au reste.
 *
 * On n'y met jamais de contenu utilisateur : des compteurs, des IP hashées à durée de vie
 * courte, des identifiants d'analyse éphémères.
 */
export interface Stockage {
  /**
   * Ajoute `delta` (négatif possible) au compteur et renvoie le nouveau total, de façon
   * atomique. La clé est créée à 0 si besoin. Avec `ttlS`, sa durée de vie est renouvelée.
   */
  incrementer(cle: string, delta: number, ttlS?: number): Promise<number>;
  lire(cle: string): Promise<number | null>;
  /** Écrit une valeur qui disparaît d'elle-même après `ttlS` secondes. */
  poser(cle: string, valeur: string, ttlS: number): Promise<void>;
  /**
   * Lit puis supprime en une seule opération atomique : parmi plusieurs appels simultanés,
   * un seul reçoit la valeur. C'est ce qui garantit « un vote par analyse ».
   */
  prendre(cle: string): Promise<string | null>;
}

interface Entree {
  valeur: string;
  expire: number | null;
}

const TAILLE_MAX_AVANT_NETTOYAGE = 5_000;

/** Repli sans dépendance : valable pour une seule instance (développement, tests). */
export class StockageMemoire implements Stockage {
  private readonly donnees = new Map<string, Entree>();

  constructor(private readonly maintenant: () => number = Date.now) {}

  private entree(cle: string): Entree | undefined {
    const e = this.donnees.get(cle);
    if (e && e.expire !== null && e.expire <= this.maintenant()) {
      this.donnees.delete(cle);
      return undefined;
    }
    return e;
  }

  private nettoyer(): void {
    if (this.donnees.size < TAILLE_MAX_AVANT_NETTOYAGE) return;
    for (const cle of [...this.donnees.keys()]) this.entree(cle);
  }

  async incrementer(cle: string, delta: number, ttlS?: number): Promise<number> {
    this.nettoyer();
    const actuel = this.entree(cle);
    const total = (actuel ? Number(actuel.valeur) : 0) + delta;
    const expire = ttlS !== undefined ? this.maintenant() + ttlS * 1000 : (actuel?.expire ?? null);
    this.donnees.set(cle, { valeur: String(total), expire });
    return total;
  }

  async lire(cle: string): Promise<number | null> {
    const e = this.entree(cle);
    if (!e) return null;
    const n = Number(e.valeur);
    return Number.isFinite(n) ? n : null;
  }

  async poser(cle: string, valeur: string, ttlS: number): Promise<void> {
    this.nettoyer();
    this.donnees.set(cle, { valeur, expire: this.maintenant() + ttlS * 1000 });
  }

  async prendre(cle: string): Promise<string | null> {
    const e = this.entree(cle);
    if (!e) return null;
    this.donnees.delete(cle);
    return e.valeur;
  }

  /** Pour les tests : les clés présentes, sans leurs valeurs. */
  cles(): string[] {
    return [...this.donnees.keys()].filter((c) => this.entree(c) !== undefined);
  }
}
