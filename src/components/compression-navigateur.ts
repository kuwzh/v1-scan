import { compresserImage, type Encodeur } from "@/lib/client/compression";

export type MotifEchecImage = "illisible" | "trop_lourde";

export class ErreurImage extends Error {
  constructor(readonly motif: MotifEchecImage) {
    super(motif);
  }
}

/** Au-delà, on n'essaie même pas de décoder : l'appareil pourrait manquer de mémoire. */
const TAILLE_MAX_SOURCE = 30_000_000;

/**
 * Décode une capture, la réduit (1 600 px, JPEG) et la ré-encode dans le navigateur, avant tout
 * envoi. Le ré-encodage retire aussi les métadonnées (position GPS, appareil).
 */
export async function compresserFichier(fichier: File): Promise<Blob> {
  if (!fichier.type.startsWith("image/")) throw new ErreurImage("illisible");
  if (fichier.size > TAILLE_MAX_SOURCE) throw new ErreurImage("trop_lourde");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(fichier);
  } catch {
    throw new ErreurImage("illisible");
  }

  const encoder: Encodeur = ({ largeur, hauteur }, qualite) =>
    new Promise((resolve, reject) => {
      const canvas = document.createElement("canvas");
      canvas.width = largeur;
      canvas.height = hauteur;
      const contexte = canvas.getContext("2d");
      if (!contexte) return reject(new ErreurImage("illisible"));
      // Fond blanc : un PNG transparent deviendrait noir une fois converti en JPEG.
      contexte.fillStyle = "#fff";
      contexte.fillRect(0, 0, largeur, hauteur);
      contexte.drawImage(bitmap, 0, 0, largeur, hauteur);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new ErreurImage("illisible"))),
        "image/jpeg",
        qualite,
      );
    });

  try {
    const r = await compresserImage({ largeur: bitmap.width, hauteur: bitmap.height }, encoder);
    if (!r) throw new ErreurImage("trop_lourde");
    return r.blob;
  } finally {
    bitmap.close();
  }
}
