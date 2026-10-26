import {
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
  MAX_TOTAL_IMAGE_BYTES,
  type ACCEPTED_IMAGE_TYPES,
} from "../contracts/limits";
import type { ImageEntree } from "../ai/types";

type TypeImage = (typeof ACCEPTED_IMAGE_TYPES)[number];

const ascii = (o: Uint8Array, debut: number, texte: string) =>
  [...texte].every((c, i) => o[debut + i] === c.charCodeAt(0));

/**
 * Reconnaît le format d'après les premiers octets, pas d'après le type déclaré par le client
 * (falsifiable). Le serveur ne décode jamais l'image : il la transmet telle quelle à l'IA.
 */
export function detecterTypeImage(o: Uint8Array): TypeImage | null {
  if (o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return "image/jpeg";
  if (
    o[0] === 0x89 &&
    ascii(o, 1, "PNG") &&
    o[4] === 0x0d &&
    o[5] === 0x0a &&
    o[6] === 0x1a &&
    o[7] === 0x0a
  ) {
    return "image/png";
  }
  if (ascii(o, 0, "RIFF") && ascii(o, 8, "WEBP")) return "image/webp";
  return null;
}

export type ResultatImages =
  | { ok: true; images: ImageEntree[] }
  | { ok: false; raison: "nombre" | "format" | "taille" | "taille_totale" };

export async function validerImages(fichiers: readonly File[]): Promise<ResultatImages> {
  if (fichiers.length > MAX_IMAGES) return { ok: false, raison: "nombre" };
  let total = 0;
  for (const f of fichiers) {
    if (f.size === 0) return { ok: false, raison: "format" };
    if (f.size > MAX_IMAGE_BYTES) return { ok: false, raison: "taille" };
    total += f.size;
  }
  if (total > MAX_TOTAL_IMAGE_BYTES) return { ok: false, raison: "taille_totale" };

  const images: ImageEntree[] = [];
  for (const f of fichiers) {
    const octets = new Uint8Array(await f.arrayBuffer());
    const mediaType = detecterTypeImage(octets);
    if (!mediaType) return { ok: false, raison: "format" };
    images.push({ mediaType, base64: Buffer.from(octets).toString("base64") });
  }
  return { ok: true, images };
}
