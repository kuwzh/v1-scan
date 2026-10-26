import { describe, expect, it } from "vitest";
import { analyserDemande } from "../src/lib/analyze/pipeline";
import { niveauAuMoins } from "../src/lib/eval/metriques";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { CAS_IMAGES, CAS_TEXTE, TEXTES_SAINS, TEXTES_SUSPECTS, TOUS_LES_CAS } from "./dataset";

function __dirname_eval(): string {
  return new URL(".", import.meta.url).pathname;
}

describe("jeu de données d'évaluation : cohérence", () => {
  it("identifiants uniques", () => {
    const ids = TOUS_LES_CAS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("chaque capture référencée existe, et chaque capture du dossier est utilisée", () => {
    const dossier = join(__dirname_eval(), "images");
    const utilisees = CAS_IMAGES.flatMap((c) => c.entree.images ?? []);
    for (const nom of utilisees) expect(existsSync(join(dossier, nom)), nom).toBe(true);
    expect(new Set(utilisees).size).toBe(utilisees.length);
  });

  it("les cas à captures testent l'invention de données et l'auteur inconnu", () => {
    const champsNuls = CAS_IMAGES.flatMap((c) => {
      const e = c.attendu.extraction;
      return [...Object.values(e?.vendeur ?? {}), ...Object.values(e?.annonce ?? {})];
    }).filter((v) => v === null);
    expect(champsNuls.length).toBeGreaterThanOrEqual(3);
    const inconnus = CAS_IMAGES.flatMap((c) => c.attendu.extraction?.messages ?? []).filter(
      (m) => m.auteur === "inconnu",
    );
    expect(inconnus.length).toBeGreaterThanOrEqual(2);
  });

  it("chaque cas a un texte, une description et une attente de niveau", () => {
    for (const c of CAS_TEXTE) {
      expect(c.entree.texte?.trim(), c.id).toBeTruthy();
      expect(c.description.length, c.id).toBeGreaterThan(10);
      if (c.categorie === "sain") expect(c.attendu.niveauMax, c.id).toBeDefined();
      else expect(c.attendu.niveauMin, c.id).toBeDefined();
    }
  });

  it("assez de cas pour un premier signal, avec des pièges parmi les sains", () => {
    expect(TEXTES_SAINS.length).toBeGreaterThanOrEqual(25);
    expect(TEXTES_SUSPECTS.length).toBeGreaterThanOrEqual(20);
    expect(TEXTES_SAINS.filter((c) => c.groupe === "piege").length).toBeGreaterThanOrEqual(12);
  });

  it("couvre les deux cas d'auteur : étiqueté et non étiqueté", () => {
    const auteurs = CAS_TEXTE.flatMap((c) => c.attendu.extraction?.messages ?? []).map(
      (m) => m.auteur,
    );
    for (const a of ["acheteur", "vendeur", "inconnu"]) expect(auteurs).toContain(a);
  });
});

/**
 * Régression des règles seules : sur le texte brut, sans IA, les conversations saines ne
 * doivent pas déclencher d'alerte et les suspectes doivent être repérées. Les cas qui exigent
 * l'IA (séparation des auteurs, lecture d'un profil) sont mesurés par `pnpm eval`.
 */
describe("règles seules sur le texte brut", () => {
  const sansIa = CAS_TEXTE.filter((c) => !c.exigeIa);

  it.each(sansIa.filter((c) => c.categorie === "sain").map((c) => [c.id, c] as const))(
    "sain · %s : pas d'alerte",
    async (_id, c) => {
      const r = await analyserDemande({ images: [], texte: c.entree.texte }, { evaluerIa: null });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const attendu = c.attendu.niveauMax ?? "faible";
      const contexte = `${r.resultat.score} · ${r.resultat.signaux.map((s) => s.id).join(", ")}`;
      expect(niveauAuMoins(r.resultat.niveau, "moyen") && attendu === "faible", contexte).toBe(
        false,
      );
      expect(
        r.resultat.signaux.some((s) => s.gravite === "critique"),
        contexte,
      ).toBe(false);
      const ids = r.resultat.signaux.map((s) => s.id);
      for (const interdit of c.attendu.signauxInterdits ?? [])
        expect(ids, contexte).not.toContain(interdit);
    },
  );

  it.each(sansIa.filter((c) => c.categorie === "suspect").map((c) => [c.id, c] as const))(
    "suspect · %s : alerte au niveau attendu",
    async (_id, c) => {
      const r = await analyserDemande({ images: [], texte: c.entree.texte }, { evaluerIa: null });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const ids = r.resultat.signaux.map((s) => s.id);
      const contexte = `${r.resultat.score} · ${ids.join(", ")}`;
      expect(niveauAuMoins(r.resultat.niveau, c.attendu.niveauMin ?? "moyen"), contexte).toBe(true);
      for (const attendu of c.attendu.signauxAttendus ?? [])
        expect(ids, contexte).toContain(attendu);
    },
  );
});
