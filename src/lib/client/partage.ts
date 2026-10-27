import { APP_NAME } from "../config";
import { fr } from "../copy/fr";
import type { DonneesCarte } from "../partage/carte";
import { HAUTEUR, LARGEUR, dessinerCarte } from "../partage/dessin";

/**
 * Génération et partage de la carte, 100 % dans le navigateur : l'image est dessinée dans un
 * canvas local, puis partagée ou téléchargée à partir d'un `Blob`. Rien n'est envoyé au serveur,
 * rien ne passe dans une URL.
 */

/** PNG de 1080 × 1920 px : la taille d'une story, nette sur tous les écrans (pas de mise à l'échelle). */
export async function genererImage(donnees: DonneesCarte, doc: Document = document): Promise<Blob> {
  const canvas = doc.createElement("canvas");
  canvas.width = LARGEUR;
  canvas.height = HAUTEUR;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas indisponible");
  dessinerCarte(ctx, donnees);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("image vide"))), "image/png");
  });
}

export type IssuePartage =
  /** La feuille de partage du système a été utilisée. */
  | "partage"
  /** La personne a fermé la feuille de partage : rien à faire de plus. */
  | "annule"
  /** Pas de partage de fichier (iPhone, navigateur intégré à une appli) : montrer l'image à enregistrer. */
  | "apercu"
  /** Pas de partage de fichier : l'image a été téléchargée. */
  | "telecharge";

type NavigateurPartage = Pick<
  Navigator,
  "canShare" | "share" | "userAgent" | "platform" | "maxTouchPoints"
>;

/** iPhone, iPad, et iPad qui se présente comme un Mac : ils n'enregistrent pas un fichier téléchargé dans Photos. */
export function estAppareilApple(
  nav: Pick<Navigator, "userAgent" | "platform" | "maxTouchPoints">,
) {
  return (
    /iPad|iPhone|iPod/.test(nav.userAgent) ||
    (nav.platform === "MacIntel" && (nav.maxTouchPoints ?? 0) > 1)
  );
}

export function creerFichier(blob: Blob): File {
  return new File([blob], fr.partage.nomFichier, { type: "image/png" });
}

/** Télécharge l'image (ordinateur, navigateurs sans partage de fichier). */
export function telechargerImage(blob: Blob, doc: Document = document): void {
  const url = URL.createObjectURL(blob);
  const lien = doc.createElement("a");
  lien.href = url;
  lien.download = fr.partage.nomFichier;
  lien.rel = "noopener";
  doc.body.append(lien);
  lien.click();
  lien.remove();
  // Laisse au navigateur le temps de démarrer le téléchargement avant de libérer l'adresse.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export interface OptionsPartage {
  navigateur?: NavigateurPartage;
  telecharger?: (blob: Blob) => void;
  /** Texte joint au partage (l'accroche et l'adresse du site : rien de l'analyse). */
  texte: string;
}

/**
 * Partage l'image : feuille de partage du système avec le fichier (mobile) quand le navigateur le
 * permet ; sinon l'aperçu à enregistrer sur iPhone et iPad, ou un téléchargement ailleurs.
 *
 * À appeler directement depuis le geste de la personne (clic) : l'image doit déjà être prête, car
 * Safari refuse `share()` si trop de temps s'écoule entre le clic et l'appel.
 */
export async function partagerImage(blob: Blob, options: OptionsPartage): Promise<IssuePartage> {
  const nav = options.navigateur ?? navigator;
  const fichier = creerFichier(blob);
  if (typeof nav.canShare === "function" && typeof nav.share === "function") {
    let permis = false;
    try {
      permis = nav.canShare({ files: [fichier] });
    } catch {
      permis = false;
    }
    if (permis) {
      try {
        await nav.share({ files: [fichier], title: APP_NAME, text: options.texte });
        return "partage";
      } catch (erreur) {
        // Fermer la feuille n'est pas une erreur ; tout autre refus bascule sur l'enregistrement.
        if (erreur instanceof DOMException && erreur.name === "AbortError") return "annule";
      }
    }
  }
  if (estAppareilApple(nav)) return "apercu";
  (options.telecharger ?? ((b: Blob) => telechargerImage(b)))(blob);
  return "telecharge";
}
