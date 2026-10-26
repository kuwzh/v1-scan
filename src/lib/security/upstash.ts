import { Redis } from "@upstash/redis";
import type { Stockage } from "./stockage";

/**
 * Adaptateur Upstash Redis (REST). La désérialisation automatique est coupée : tout est lu
 * comme du texte, sinon une valeur qui ressemble à du JSON reviendrait sous forme d'objet.
 */
export function creerStockageUpstash(redis: Redis): Stockage {
  return {
    async incrementer(cle, delta, ttlS) {
      if (ttlS === undefined) return redis.incrby(cle, delta);
      // MULTI : le compteur ne peut pas rester sans durée de vie si la 2e commande échoue.
      const [total] = await redis
        .multi()
        .incrby(cle, delta)
        .expire(cle, ttlS)
        .exec<[number, number]>();
      return total;
    },
    async lire(cle) {
      const v = await redis.get<string | number>(cle);
      if (v === null || v === undefined) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    },
    async poser(cle, valeur, ttlS) {
      await redis.set(cle, valeur, { ex: ttlS });
    },
    async prendre(cle) {
      const v = await redis.getdel<string | number>(cle);
      return v === null || v === undefined ? null : String(v);
    },
  };
}

export function creerRedis(url: string, token: string): Redis {
  return new Redis({ url, token, automaticDeserialization: false, retry: { retries: 1 } });
}
