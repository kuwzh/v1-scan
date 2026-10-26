/** Nom provisoire du produit : à changer ici et nulle part ailleurs. */
export const APP_NAME = "Gardo";

const DEFAULT_SITE_URL = "http://localhost:3000";

/**
 * URL publique du site, sans slash final. Sert à la carte de partage, aux
 * métadonnées et au manifest. Retombe sur localhost si la variable est absente
 * ou invalide.
 */
export function getSiteUrl(env: Record<string, string | undefined> = process.env): string {
  const raw = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return DEFAULT_SITE_URL;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return DEFAULT_SITE_URL;
    return url.origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
}
