import {
  IMAGE_MAX_SIDE_PX,
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
  MAX_TOTAL_IMAGE_BYTES,
} from "../contracts/limits";

/**
 * Budget par image : le total de 3 images doit tenir dans `MAX_TOTAL_IMAGE_BYTES`, ce qui est
 * un peu plus strict que la limite d'une image seule.
 */
export const BUDGET_IMAGE_OCTETS = Math.min(
  MAX_IMAGE_BYTES,
  Math.floor(MAX_TOTAL_IMAGE_BYTES / MAX_IMAGES),
);

/** Qualités JPEG essayées d'abord (le texte d'une capture reste lisible), puis on réduit la taille. */
export const QUALITES_JPEG = [0.86, 0.76, 0.66, 0.56] as const;
export const ECHELLES = [1, 0.85, 0.7, 0.55] as const;

export interface Dimensions {
  largeur: number;
  hauteur: number;
}

/** Réduit pour que le plus grand côté ne dépasse pas `cote`, sans jamais agrandir. */
export function dimensionsCibles(source: Dimensions, cote = IMAGE_MAX_SIDE_PX): Dimensions {
  const plusGrand = Math.max(source.largeur, source.hauteur);
  const facteur = plusGrand > cote ? cote / plusGrand : 1;
  return {
    largeur: Math.max(1, Math.round(source.largeur * facteur)),
    hauteur: Math.max(1, Math.round(source.hauteur * facteur)),
  };
}

/** Encode l'image aux dimensions et à la qualité demandées (canvas dans le navigateur). */
export type Encodeur = (dimensions: Dimensions, qualite: number) => Promise<Blob>;

export interface ImageCompressee extends Dimensions {
  blob: Blob;
}

/**
 * Cherche le premier encodage qui tient dans `budget` : on baisse d'abord la qualité, puis la
 * taille. `null` si rien ne tient (image démesurée ou illisible).
 *
 * Ré-encoder systématiquement a un avantage de confidentialité : les métadonnées (position GPS,
 * modèle de l'appareil) de l'image d'origine ne sont jamais envoyées.
 */
export async function compresserImage(
  source: Dimensions,
  encoder: Encodeur,
  budget = BUDGET_IMAGE_OCTETS,
): Promise<ImageCompressee | null> {
  const base = dimensionsCibles(source);
  for (const echelle of ECHELLES) {
    const dimensions = dimensionsCibles(
      { largeur: base.largeur * echelle, hauteur: base.hauteur * echelle },
      Number.POSITIVE_INFINITY,
    );
    for (const qualite of QUALITES_JPEG) {
      const blob = await encoder(dimensions, qualite);
      if (blob.size > 0 && blob.size <= budget) return { blob, ...dimensions };
    }
  }
  return null;
}
