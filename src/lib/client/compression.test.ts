import { describe, expect, it, vi } from "vitest";
import { IMAGE_MAX_SIDE_PX, MAX_IMAGES, MAX_TOTAL_IMAGE_BYTES } from "../contracts/limits";
import {
  BUDGET_IMAGE_OCTETS,
  QUALITES_JPEG,
  compresserImage,
  dimensionsCibles,
  type Encodeur,
} from "./compression";

describe("dimensionsCibles", () => {
  it("réduit le plus grand côté à 1 600 px en gardant les proportions", () => {
    expect(dimensionsCibles({ largeur: 3200, hauteur: 1600 })).toEqual({
      largeur: IMAGE_MAX_SIDE_PX,
      hauteur: 800,
    });
    expect(dimensionsCibles({ largeur: 1170, hauteur: 2532 })).toEqual({
      largeur: 739,
      hauteur: 1600,
    });
  });

  it("n'agrandit jamais une petite image", () => {
    expect(dimensionsCibles({ largeur: 600, hauteur: 400 })).toEqual({
      largeur: 600,
      hauteur: 400,
    });
  });

  it("ne renvoie jamais une dimension nulle", () => {
    expect(dimensionsCibles({ largeur: 10_000, hauteur: 1 })).toEqual({
      largeur: 1600,
      hauteur: 1,
    });
  });
});

describe("BUDGET_IMAGE_OCTETS", () => {
  it("fait tenir trois images dans la limite totale du serveur", () => {
    expect(BUDGET_IMAGE_OCTETS * MAX_IMAGES).toBeLessThanOrEqual(MAX_TOTAL_IMAGE_BYTES);
  });
});

/** Encodeur factice : la taille dépend de la surface et de la qualité, comme un vrai JPEG. */
const encodeurProportionnel =
  (octetsParPixelPleineQualite: number): Encodeur =>
  async ({ largeur, hauteur }, qualite) =>
    ({ size: Math.round(largeur * hauteur * octetsParPixelPleineQualite * qualite) }) as Blob;

describe("compresserImage", () => {
  const source = { largeur: 1170, hauteur: 2532 };

  it("garde la meilleure qualité quand elle tient dans le budget", async () => {
    const encoder = vi.fn(encodeurProportionnel(0.1));
    const r = await compresserImage(source, encoder);
    expect(r).not.toBeNull();
    expect(encoder).toHaveBeenCalledTimes(1);
    expect(encoder.mock.calls[0]?.[1]).toBe(QUALITES_JPEG[0]);
    expect(r?.largeur).toBe(739);
    expect(r?.hauteur).toBe(1600);
  });

  it("baisse la qualité avant de réduire la taille", async () => {
    // Plein tarif ≈ 1,6 Mo : trop gros ; à qualité 0,66 ≈ 1,23 Mo : encore trop ; à 0,56 ≈ 1,05 Mo : ok.
    const encoder = vi.fn(encodeurProportionnel(1.4));
    const r = await compresserImage(source, encoder);
    expect(r?.largeur).toBe(739);
    const qualites = encoder.mock.calls.map((c) => c[1]);
    expect(qualites).toEqual([...QUALITES_JPEG].slice(0, qualites.length));
    expect(r && r.blob.size <= BUDGET_IMAGE_OCTETS).toBe(true);
  });

  it("réduit la taille quand la qualité ne suffit pas", async () => {
    const r = await compresserImage(source, encodeurProportionnel(3));
    expect(r).not.toBeNull();
    expect(r!.largeur).toBeLessThan(739);
    expect(r!.blob.size).toBeLessThanOrEqual(BUDGET_IMAGE_OCTETS);
  });

  it("garde les proportions à chaque échelle", async () => {
    const r = await compresserImage(source, encodeurProportionnel(3));
    expect(r!.hauteur / r!.largeur).toBeCloseTo(2532 / 1170, 1);
  });

  it("renvoie null quand rien ne tient dans le budget", async () => {
    expect(await compresserImage(source, encodeurProportionnel(1000))).toBeNull();
  });

  it("ignore un encodage vide (échec du canvas)", async () => {
    const encoder: Encodeur = async () => new Blob([]);
    expect(await compresserImage(source, encoder)).toBeNull();
  });

  it("n'essaie qu'un nombre borné d'encodages", async () => {
    const encoder = vi.fn(encodeurProportionnel(1000));
    await compresserImage(source, encoder);
    expect(encoder.mock.calls.length).toBeLessThanOrEqual(16);
  });
});
