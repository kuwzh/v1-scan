import { describe, expect, it } from "vitest";
import {
  completerConfiance,
  creerMessage,
  donneesExtraitesVides,
  type Confiance,
  type ExtractedData,
} from "../contracts/extracted";
import { analyserLiens } from "../links/analyse";
import { collecterLiensBruts } from "./contexte";
import { donneesFiables } from "./fiabilite";
import { evaluerRegles } from "./moteur";

/** Données avec un vendeur et une annonce renseignés ; `confiance` s'applique à tout. */
function donnees(
  modifier: (d: ExtractedData) => void,
  confiance: Confiance | { [chemin: string]: Confiance },
): ExtractedData {
  const d = donneesExtraitesVides();
  d.plateforme = "vinted";
  modifier(d);
  const complete = completerConfiance(d, typeof confiance === "string" ? confiance : "haute");
  if (typeof confiance !== "string") {
    for (const [chemin, valeur] of Object.entries(confiance)) {
      const [groupe, cle] = chemin.split(".") as ["annonce" | "vendeur", string];
      (complete.confiance[groupe] as Record<string, Confiance | null>)[cle] = valeur;
    }
  }
  return complete;
}

function regles(d: ExtractedData) {
  return evaluerRegles({ donnees: d, liens: analyserLiens(collecterLiensBruts(d)) });
}
const ids = (d: ExtractedData) => regles(d).signaux.map((s) => s.id);

describe("donneesFiables", () => {
  it("retire les données à confiance basse et garde haute et moyenne", () => {
    const d = donnees(
      (x) => {
        x.vendeur.nombre_avis = 12;
        x.vendeur.anciennete_jours = 400;
        x.vendeur.note_sur_5 = 4.7;
        x.annonce.prix_eur = 25;
      },
      {
        "vendeur.nombre_avis": "basse",
        "vendeur.anciennete_jours": "moyenne",
        "vendeur.note_sur_5": "haute",
        "annonce.prix_eur": "basse",
      },
    );
    const { donnees: f, ignorees } = donneesFiables(d);
    expect(f.vendeur.nombre_avis).toBeNull();
    expect(f.annonce.prix_eur).toBeNull();
    expect(f.vendeur.anciennete_jours).toBe(400);
    expect(f.vendeur.note_sur_5).toBe(4.7);
    expect(ignorees.sort()).toEqual(["annonce.prix_eur", "vendeur.nombre_avis"]);
  });

  it("écarte les messages à confiance basse", () => {
    const d = donneesExtraitesVides();
    d.messages = [
      creerMessage("vendeur", "net", "haute"),
      creerMessage("vendeur", "flou", "basse"),
      creerMessage("vendeur", "à peu près", "moyenne"),
    ];
    const { donnees: f, ignorees } = donneesFiables(d);
    expect(f.messages.map((m) => m.texte)).toEqual(["net", "à peu près"]);
    expect(ignorees).toEqual(["messages[1]"]);
  });

  it("ne modifie pas les données d'origine", () => {
    const d = donnees((x) => (x.vendeur.nombre_avis = 3), "basse");
    donneesFiables(d);
    expect(d.vendeur.nombre_avis).toBe(3);
  });
});

describe("les règles de profil ignorent les données à confiance basse", () => {
  const compteNeuf = (x: ExtractedData) => {
    x.vendeur.anciennete_jours = 3;
    x.vendeur.nombre_avis = 0;
    x.vendeur.nombre_annonces = 14;
    x.vendeur.note_sur_5 = null;
  };

  it("avec une confiance haute, le profil neuf lève ses signaux", () => {
    expect(ids(donnees(compteNeuf, "haute"))).toEqual(
      expect.arrayContaining([
        "profil.compte_tres_recent",
        "profil.aucun_avis",
        "profil.beaucoup_d_annonces",
      ]),
    );
  });

  it("la confiance moyenne compte aussi", () => {
    expect(ids(donnees(compteNeuf, "moyenne"))).toContain("profil.compte_tres_recent");
  });

  it("avec une confiance basse, plus aucun signal de profil, et le score est nul", () => {
    const d = donnees(compteNeuf, "basse");
    const r = regles(d);
    expect(r.signaux).toEqual([]);
    expect(r.score).toBe(0);
    expect(r.ignorees.sort()).toEqual([
      "vendeur.anciennete_jours",
      "vendeur.nombre_annonces",
      "vendeur.nombre_avis",
    ]);
  });

  it("chaque donnée est ignorée indépendamment des autres", () => {
    const d = donnees(compteNeuf, {
      "vendeur.anciennete_jours": "basse",
      "vendeur.nombre_avis": "haute",
      "vendeur.nombre_annonces": "haute",
    });
    const trouves = ids(d);
    expect(trouves).toContain("profil.aucun_avis");
    expect(trouves).not.toContain("profil.compte_tres_recent");
    // Le volume d'annonces ne vaut que pour un compte récent : sans ancienneté, il se tait.
    expect(trouves).not.toContain("profil.beaucoup_d_annonces");
  });

  it("une note mal lue ne déclenche pas « note basse »", () => {
    const note = (c: Confiance) =>
      ids(
        donnees(
          (x) => {
            x.vendeur.nombre_avis = 20;
            x.vendeur.note_sur_5 = 2;
          },
          { "vendeur.nombre_avis": "haute", "vendeur.note_sur_5": c },
        ),
      );
    expect(note("haute")).toContain("profil.note_tres_basse");
    expect(note("basse")).not.toContain("profil.note_tres_basse");
  });

  it("un profil « solide » mal lu ne donne ni rassurant ni remise", () => {
    const solide = (x: ExtractedData) => {
      x.vendeur.anciennete_jours = 900;
      x.vendeur.nombre_avis = 120;
      x.vendeur.note_sur_5 = 4.9;
      x.vendeur.profil_verifie = true;
    };
    const fiable = regles(donnees(solide, "haute"));
    expect(fiable.rassurants.length).toBe(3);
    expect(fiable.remise).toBe(10);

    const douteux = regles(donnees(solide, "basse"));
    expect(douteux.rassurants).toEqual([]);
    expect(douteux.remise).toBe(0);
  });

  it("un prix mal lu ne déclenche pas « prix anormalement bas »", () => {
    const sac = (c: Confiance) =>
      ids(
        donnees(
          (x) => {
            x.annonce.titre = "Sac Louis Vuitton";
            x.annonce.marque = "Louis Vuitton";
            x.annonce.prix_eur = 25;
          },
          { "annonce.titre": "haute", "annonce.marque": "haute", "annonce.prix_eur": c },
        ),
      );
    expect(sac("haute")).toContain("prix.tres_bas");
    expect(sac("basse")).not.toContain("prix.tres_bas");
  });

  it("un message mal lu ne lève aucun signal", () => {
    const d = donneesExtraitesVides();
    d.messages = [
      creerMessage("vendeur", "Écris-moi sur WhatsApp, je préfère un virement", "basse"),
    ];
    expect(regles(d).signaux).toEqual([]);
    d.messages = [
      creerMessage("vendeur", "Écris-moi sur WhatsApp, je préfère un virement", "moyenne"),
    ];
    expect(regles(d).signaux.map((s) => s.id)).toContain("plateforme.whatsapp");
  });

  it("les liens d'un message mal lu ne sont pas collectés", () => {
    const d = donneesExtraitesVides();
    d.messages = [creerMessage("vendeur", "Paie ici : vinted-paiement.com", "basse")];
    expect(collecterLiensBruts(d)).toEqual([]);
    d.messages = [creerMessage("vendeur", "Paie ici : vinted-paiement.com", "haute")];
    expect(collecterLiensBruts(d)).toEqual(["vinted-paiement.com"]);
  });
});
