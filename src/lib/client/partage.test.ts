import { describe, expect, it, vi } from "vitest";
import { fr } from "../copy/fr";
import { creerFichier, estAppareilApple, partagerImage } from "./partage";

const blob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
const TEXTE = "Vérifie tes annonces avant de payer → v1-scan.vercel.app";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
const BUREAU =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

function navigateur(
  options: {
    ua?: string;
    platform?: string;
    touch?: number;
    canShare?: ((d: ShareData) => boolean) | null;
    share?: ((d: ShareData) => Promise<void>) | null;
  } = {},
) {
  const nav = {
    userAgent: options.ua ?? BUREAU,
    platform: options.platform ?? "Win32",
    maxTouchPoints: options.touch ?? 0,
    canShare: options.canShare === null ? undefined : (options.canShare ?? (() => true)),
    share: options.share === null ? undefined : (options.share ?? (async () => undefined)),
  };
  return nav as unknown as Navigator;
}

describe("partagerImage : feuille de partage avec fichier", () => {
  it("partage le PNG avec le texte, et rien d'autre", async () => {
    const share = vi.fn<(d: ShareData) => Promise<void>>(async () => undefined);
    const issue = await partagerImage(blob, {
      navigateur: navigateur({ ua: ANDROID, share }),
      texte: TEXTE,
    });
    expect(issue).toBe("partage");
    const donnees = share.mock.calls[0]?.[0];
    expect(Object.keys(donnees ?? {}).sort()).toEqual(["files", "text", "title"]);
    expect(donnees?.text).toBe(TEXTE);
    expect(donnees?.files).toHaveLength(1);
    expect(donnees?.files?.[0]?.name).toBe("gardo-resultat.png");
    expect(donnees?.files?.[0]?.type).toBe("image/png");
    // Aucune adresse construite à partir de l'analyse.
    expect(donnees).not.toHaveProperty("url");
  });

  it("vérifie d'abord canShare({ files })", async () => {
    const canShare = vi.fn<(d: ShareData) => boolean>(() => true);
    await partagerImage(blob, { navigateur: navigateur({ canShare }), texte: TEXTE });
    expect(canShare.mock.calls[0]?.[0]?.files?.[0]).toBeInstanceOf(File);
  });

  it("la personne ferme la feuille (AbortError) : annulé, ni téléchargement ni aperçu", async () => {
    const telecharger = vi.fn();
    const issue = await partagerImage(blob, {
      navigateur: navigateur({
        ua: IPHONE,
        share: async () => {
          throw new DOMException("fermé", "AbortError");
        },
      }),
      telecharger,
      texte: TEXTE,
    });
    expect(issue).toBe("annule");
    expect(telecharger).not.toHaveBeenCalled();
  });

  it("refus du navigateur (NotAllowedError) : repli, jamais d'erreur levée", async () => {
    const telecharger = vi.fn();
    const issue = await partagerImage(blob, {
      navigateur: navigateur({
        share: async () => {
          throw new DOMException("geste expiré", "NotAllowedError");
        },
      }),
      telecharger,
      texte: TEXTE,
    });
    expect(issue).toBe("telecharge");
    expect(telecharger).toHaveBeenCalledWith(blob);
  });

  it("canShare qui lève une exception : repli", async () => {
    const issue = await partagerImage(blob, {
      navigateur: navigateur({
        canShare: () => {
          throw new TypeError("non supporté");
        },
      }),
      telecharger: () => undefined,
      texte: TEXTE,
    });
    expect(issue).toBe("telecharge");
  });
});

describe("partagerImage : repli sans partage de fichier", () => {
  it("ordinateur : l'image est téléchargée", async () => {
    const telecharger = vi.fn();
    const issue = await partagerImage(blob, {
      navigateur: navigateur({ canShare: null, share: null }),
      telecharger,
      texte: TEXTE,
    });
    expect(issue).toBe("telecharge");
    expect(telecharger).toHaveBeenCalledWith(blob);
  });

  it("canShare répond « non » pour les fichiers : téléchargement", async () => {
    const share = vi.fn();
    const telecharger = vi.fn();
    const issue = await partagerImage(blob, {
      navigateur: navigateur({ canShare: () => false, share }),
      telecharger,
      texte: TEXTE,
    });
    expect(issue).toBe("telecharge");
    expect(share).not.toHaveBeenCalled();
  });

  it("iPhone sans partage de fichier (ancien iOS, navigateur intégré) : aperçu à enregistrer dans Photos", async () => {
    const telecharger = vi.fn();
    const issue = await partagerImage(blob, {
      navigateur: navigateur({ ua: IPHONE, canShare: null, share: null }),
      telecharger,
      texte: TEXTE,
    });
    expect(issue).toBe("apercu");
    // Sur iOS, un fichier téléchargé va dans Fichiers, pas dans Photos.
    expect(telecharger).not.toHaveBeenCalled();
  });

  it("iPhone dont le partage est refusé : aperçu", async () => {
    const issue = await partagerImage(blob, {
      navigateur: navigateur({
        ua: IPHONE,
        share: async () => {
          throw new DOMException("refusé", "NotAllowedError");
        },
      }),
      texte: TEXTE,
    });
    expect(issue).toBe("apercu");
  });
});

describe("estAppareilApple", () => {
  it.each([
    [IPHONE, "iPhone", 5, true],
    ["Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X)", "iPad", 5, true],
    // iPadOS se présente comme un Mac : seul l'écran tactile le distingue.
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 5, true],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 0, false],
    [ANDROID, "Linux armv8l", 5, false],
    [BUREAU, "Win32", 0, false],
  ])("%s (%s, %i points) → %s", (userAgent, platform, maxTouchPoints, attendu) => {
    expect(estAppareilApple({ userAgent, platform, maxTouchPoints })).toBe(attendu);
  });
});

describe("creerFichier", () => {
  it("un PNG au nom fixe, sans rien de l'analyse", async () => {
    const f = creerFichier(blob);
    expect(f.name).toBe(fr.partage.nomFichier);
    expect(f.type).toBe("image/png");
    expect(f.size).toBe(blob.size);
  });
});
