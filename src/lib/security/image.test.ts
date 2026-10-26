import { describe, expect, it } from "vitest";
import { MAX_IMAGE_BYTES, MAX_IMAGES, MAX_TOTAL_IMAGE_BYTES } from "../contracts/limits";
import { detecterTypeImage, validerImages } from "./image";

const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP = [...Buffer.from("RIFF"), 1, 2, 3, 4, ...Buffer.from("WEBPVP8 ")];

function fichier(entete: number[], taille = 100, type = "application/octet-stream"): File {
  const octets = new Uint8Array(Math.max(taille, entete.length));
  octets.set(entete);
  return new File([octets], "capture", { type });
}

describe("detecterTypeImage", () => {
  it("reconnaît JPEG, PNG et WebP d'après les premiers octets", () => {
    expect(detecterTypeImage(Uint8Array.from(JPEG))).toBe("image/jpeg");
    expect(detecterTypeImage(Uint8Array.from(PNG))).toBe("image/png");
    expect(detecterTypeImage(Uint8Array.from(WEBP))).toBe("image/webp");
  });

  it.each([
    ["GIF", [...Buffer.from("GIF89a")]],
    ["PDF", [...Buffer.from("%PDF-1.7")]],
    ["HTML", [...Buffer.from("<html>")]],
    ["SVG", [...Buffer.from("<svg xmlns=")]],
    ["RIFF/WAV", [...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WAVE")]],
    ["PNG tronqué", PNG.slice(0, 5)],
    ["vide", []],
  ])("refuse %s", (_nom, octets) => {
    expect(detecterTypeImage(Uint8Array.from(octets))).toBeNull();
  });
});

describe("validerImages", () => {
  it("accepte des images valides et les encode en base64 avec le vrai type", async () => {
    const r = await validerImages([fichier(JPEG), fichier(PNG), fichier(WEBP)]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.images.map((i) => i.mediaType)).toEqual(["image/jpeg", "image/png", "image/webp"]);
    expect(Buffer.from(r.images[0]!.base64, "base64")[0]).toBe(0xff);
  });

  it("se fie au contenu, pas au type annoncé par le client", async () => {
    const mensonge = fichier(
      Array.from(Buffer.from("<script>alert(1)</script>")),
      100,
      "image/png",
    );
    expect(await validerImages([mensonge])).toEqual({ ok: false, raison: "format" });
    const honnete = fichier(PNG, 100, "application/octet-stream");
    const r = await validerImages([honnete]);
    expect(r.ok && r.images[0]?.mediaType).toBe("image/png");
  });

  it("annonce le vrai type même si le client en a déclaré un autre", async () => {
    const r = await validerImages([fichier(JPEG, 100, "image/png")]);
    expect(r.ok && r.images[0]?.mediaType).toBe("image/jpeg");
  });

  it("refuse un fichier vide", async () => {
    expect(await validerImages([new File([], "vide.png", { type: "image/png" })])).toEqual({
      ok: false,
      raison: "format",
    });
  });

  it("refuse une image trop lourde sans la lire", async () => {
    expect(await validerImages([fichier(JPEG, MAX_IMAGE_BYTES + 1)])).toEqual({
      ok: false,
      raison: "taille",
    });
    expect((await validerImages([fichier(JPEG, MAX_IMAGE_BYTES)])).ok).toBe(true);
  });

  it("refuse trop d'images", async () => {
    const trop = Array.from({ length: MAX_IMAGES + 1 }, () => fichier(JPEG));
    expect(await validerImages(trop)).toEqual({ ok: false, raison: "nombre" });
  });

  it("refuse un total trop lourd", async () => {
    const taille = Math.floor(MAX_TOTAL_IMAGE_BYTES / MAX_IMAGES) + 1;
    expect(
      await validerImages(Array.from({ length: MAX_IMAGES }, () => fichier(JPEG, taille))),
    ).toEqual({
      ok: false,
      raison: "taille_totale",
    });
  });
});
