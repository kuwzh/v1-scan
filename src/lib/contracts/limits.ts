/**
 * Limites partagées entre le client (compression, validation avant envoi) et le
 * serveur (validation à la réception). Vercel plafonne le corps d'une requête à
 * 4,5 Mo : 3 images de ~1,2 Mo + le texte restent confortablement dessous.
 */
export const MAX_IMAGES = 3;
/** Taille maximale d'une image après compression côté client. */
export const MAX_IMAGE_BYTES = 1_300_000;
/** Taille maximale cumulée des images d'une requête. */
export const MAX_TOTAL_IMAGE_BYTES = 3_600_000;
/** Plus grand côté d'une image après compression (lisibilité du texte conservée). */
export const IMAGE_MAX_SIDE_PX = 1600;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const MAX_TEXT_CHARS = 8_000;
export const MAX_URL_CHARS = 2_048;

/**
 * Taille maximale d'une requête d'analyse (captures + texte + lien + enveloppe multipart).
 * Reste sous les 4,5 Mo que Vercel accepte ; le serveur la fait respecter en lisant le corps.
 */
export const MAX_REQUEST_BYTES = 3_800_000;
