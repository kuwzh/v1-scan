import { describe, expect, it } from "vitest";
import { SEUIL_ELEVE } from "../contracts/niveau";
import { rangGravite } from "../contracts/signals";
import { trouverFormulationsInterdites } from "../copy/wording";
import { CAS_SAINS, CAS_SUSPECTS, TOUS_LES_CAS } from "./fixtures/cas";
import { lancer } from "./fixtures/lancer";
import { BANDES_POIDS } from "./poids";

describe.each([
  ["conversations saines", CAS_SAINS],
  ["conversations suspectes", CAS_SUSPECTS],
])("%s", (_, cas) => {
  it.each(cas.map((c) => [c.nom, c] as const))("%s", (_nom, c) => {
    const { regles, niveau } = lancer(c);
    const ids = regles.signaux.map((s) => s.id);
    const rassurants = regles.rassurants.map((r) => r.id);

    expect(niveau, `score ${regles.score} (${ids.join(", ")})`).toBe(c.attendu.niveau);
    for (const id of c.attendu.presents ?? []) expect(ids, id).toContain(id);
    for (const id of c.attendu.absents ?? []) expect(ids, id).not.toContain(id);
    for (const id of c.attendu.rassurants ?? []) expect(rassurants, id).toContain(id);
    if (c.attendu.critique !== undefined) {
      expect(regles.plancher !== null, "plancher").toBe(c.attendu.critique);
    }
  });
});

describe("invariants sur tous les cas", () => {
  const resultats = TOUS_LES_CAS.map((c) => ({ nom: c.nom, ...lancer(c) }));

  it("chaque poids respecte la bande de sa gravité", () => {
    for (const { nom, regles } of resultats) {
      for (const c of regles.constats) {
        const [min, max] = BANDES_POIDS[c.gravite];
        expect(c.poids, `${nom} → ${c.id}`).toBeGreaterThanOrEqual(min);
        expect(c.poids, `${nom} → ${c.id}`).toBeLessThanOrEqual(max);
      }
    }
  });

  it("seuls les signaux critiques imposent un plancher, et il atteint le niveau « élevé »", () => {
    for (const { nom, regles } of resultats) {
      for (const c of regles.constats) {
        if (c.gravite === "critique") {
          expect(c.plancher, `${nom} → ${c.id}`).toBeGreaterThanOrEqual(SEUIL_ELEVE);
        } else {
          expect(c.plancher, `${nom} → ${c.id}`).toBeUndefined();
        }
      }
    }
  });

  it("le score final ne passe jamais sous le plancher, remise comprise", () => {
    for (const { nom, regles, fusion } of resultats) {
      if (regles.plancher !== null) {
        expect(fusion.score, nom).toBeGreaterThanOrEqual(regles.plancher);
        expect(regles.score, nom).toBeGreaterThanOrEqual(regles.plancher);
      }
    }
  });

  it("les signaux sont sans doublon, triés du plus grave au moins grave, issus de règles", () => {
    for (const { nom, regles } of resultats) {
      const ids = regles.signaux.map((s) => s.id);
      expect(new Set(ids).size, nom).toBe(ids.length);
      const rangs = regles.signaux.map((s) => rangGravite(s.gravite));
      expect(rangs, nom).toEqual([...rangs].sort((a, b) => b - a));
      for (const s of regles.signaux) expect(s.source).toBe("regle");
    }
  });

  it("tous les libellés et conseils passent le garde-fou de wording", () => {
    for (const { regles } of resultats) {
      const textes = [
        ...regles.signaux.map((s) => s.label),
        ...regles.rassurants.map((r) => r.label),
        ...regles.conseils,
      ];
      for (const texte of textes) {
        expect(texte.trim(), texte).not.toBe("");
        expect(trouverFormulationsInterdites(texte), texte).toEqual([]);
      }
    }
  });

  it("la remise reste dans la limite fixée", () => {
    for (const { nom, regles } of resultats) {
      expect(regles.remise, nom).toBeGreaterThanOrEqual(0);
      expect(regles.remise, nom).toBeLessThanOrEqual(10);
    }
  });

  it("les conversations saines ne lèvent aucun signal critique", () => {
    for (const c of CAS_SAINS) {
      expect(lancer(c).regles.plancher, c.nom).toBeNull();
    }
  });

  it("chaque conversation suspecte lève au moins un signal", () => {
    for (const c of CAS_SUSPECTS) {
      expect(lancer(c).regles.signaux.length, c.nom).toBeGreaterThan(0);
    }
  });
});
