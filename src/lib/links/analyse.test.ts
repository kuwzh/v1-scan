import { describe, expect, it } from "vitest";
import { rangGravite, type Gravite } from "../contracts/signals";
import { trouverFormulationsInterdites } from "../copy/wording";
import { IDS_SIGNAUX_LIENS, analyserLien, analyserLiens } from "./analyse";
import { MARQUES, OFFICIELS } from "./marques";
import type { LienAnalyse } from "./types";

const ids = (r: LienAnalyse) => r.signaux.map((s) => s.id);
const gravite = (r: LienAnalyse, id: string): Gravite | undefined =>
  r.signaux.find((s) => s.id === id)?.gravite;
const pire = (r: LienAnalyse): number =>
  Math.max(-1, ...r.signaux.map((s) => rangGravite(s.gravite)));

/** Tous les résultats produits par ce fichier, pour vérifier le wording et la couverture. */
const produits: LienAnalyse[] = [];
function analyser(brut: string, options?: Parameters<typeof analyserLien>[1]): LienAnalyse {
  const r = analyserLien(brut, options);
  produits.push(r);
  return r;
}

describe("liste blanche : les domaines officiels ne lèvent aucun signal", () => {
  it.each([
    "https://www.vinted.fr/items/123-sac",
    "https://www.vinted.co.uk/member/12",
    "https://www.leboncoin.fr/ad/vetements/123",
    "https://paiement.leboncoin.fr/checkout", // « paiement » sur un domaine officiel : normal
    "https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition=123",
    "https://www.mondialrelay.be/",
    "https://www.mondialrelay.com/",
    "https://www.laposte.fr/outils/suivre-vos-envois",
    "https://www.colissimo.fr/",
    "https://www.chronopost.fr/tracking-no-cms/suivi-page",
    "https://www.dpd.fr/",
    "https://www.relaiscolis.com/",
    "https://www.paypal.com/myaccount",
    "https://paypal.me/vendeur",
    "https://lydia-app.com/pay/abc",
    "https://www.boursorama.com/",
    "https://mabanque.bnpparibas/",
    "VINTED.FR",
    "https://vinted.fr:443/x",
  ])("%s", (url) => {
    const r = analyser(url);
    expect(r.verdict).toBe("officiel");
    expect(r.signaux).toEqual([]);
    expect(r.marque).not.toBeNull();
  });

  it("couvre chaque domaine officiel déclaré, avec ou sans sous-domaine", () => {
    for (const [domaine, marque] of OFFICIELS) {
      for (const url of [
        `https://${domaine}/`,
        `https://www.${domaine}/x`,
        `https://a.b.${domaine}`,
      ]) {
        const r = analyserLien(url);
        expect(r.verdict, url).toBe("officiel");
        expect(r.marque?.id, url).toBe(marque.id);
      }
    }
  });
});

describe("piège du sous-domaine", () => {
  it.each([
    ["https://vinted.fr.paiement-securise.com", "vinted.fr"],
    ["leboncoin.fr-livraison.xyz", "leboncoin.fr"],
    ["https://www.leboncoin.fr.verification.top/ad", "leboncoin.fr"],
    ["paypal.com.verification-compte.net", "paypal.com"],
    ["https://secure.mondialrelay.fr.colis-info.com", "mondialrelay.fr"],
    ["x.vinted.fr.com", "vinted.fr"],
  ])("%s est un piège critique", (url, officiel) => {
    const r = analyser(url);
    expect(r.verdict).toBe("suspect");
    expect(gravite(r, "lien.sous_domaine_piege")).toBe("critique");
    expect(r.signaux[0]?.label).toContain(officiel);
  });

  it("annonce le vrai domaine dans le libellé", () => {
    const r = analyser("https://vinted.fr.paiement-securise.com/pay");
    expect(r.domaine).toBe("paiement-securise.com");
    expect(r.signaux[0]?.label).toContain("paiement-securise.com");
  });

  it("ne confond pas un domaine officiel avec un mot qui le contient", () => {
    expect(ids(analyser("https://sdpd.fr"))).not.toContain("lien.sous_domaine_piege");
    expect(ids(analyser("https://xvinted.fr.com"))).not.toContain("lien.sous_domaine_piege");
  });

  it("pour chaque domaine officiel, le piège est détecté (avec . comme avec -)", () => {
    for (const [domaine, marque] of OFFICIELS) {
      for (const url of [
        `https://${domaine}.paiement-securise.com`,
        `https://${domaine}-livraison.xyz`,
      ]) {
        const r = analyserLien(url);
        expect(gravite(r, "lien.sous_domaine_piege"), url).toBe("critique");
        expect(r.marque?.id, url).toBe(marque.id);
      }
    }
  });
});

describe("identifiant avant le @", () => {
  it("critique quand il affiche un domaine officiel", () => {
    const r = analyser("https://vinted.fr@evil.com/x");
    expect(r.hote).toBe("evil.com");
    expect(gravite(r, "lien.identifiants_trompeurs")).toBe("critique");
    expect(r.marque?.id).toBe("vinted");
  });

  it("attention quand il est inhabituel sans viser une marque", () => {
    const r = analyser("https://jean:secret@exemple-boutique.com/");
    expect(gravite(r, "lien.identifiants_trompeurs")).toBe("attention");
  });

  it("n'accuse pas un domaine officiel qui a un identifiant", () => {
    expect(analyser("https://x@vinted.fr/").verdict).toBe("officiel");
  });
});

describe("imitation d'une marque dans le domaine", () => {
  it.each([
    ["vinted-paiement.com", "vinted", "critique"],
    ["https://leboncoin-securise.fr/validation", "leboncoin", "critique"],
    ["mondialrelay-livraison.com", "mondialrelay", "critique"],
    ["mondialrelay-be.com", "mondialrelay", "importante"], // phishing réel : doit rester suspect
    ["mondial-relay-colis.fr", "mondialrelay", "critique"],
    ["colissimo-suivi-colis.top", "colissimo", "critique"],
    ["la-poste-suivi.com", "laposte", "critique"],
    ["relais-colis-retrait.net", "relaiscolis", "critique"],
    ["chronopost-verification.com", "chronopost", "critique"],
    ["dpd-colis-fr.com", "dpd", "critique"],
    ["dpdcolis.com", "dpd", "critique"],
    ["paypal-remboursement.com", "paypal", "critique"],
    ["lydia-paiement.com", "lydia", "critique"],
    ["boursorama-verification.com", "boursorama", "critique"],
    ["credit-agricole-securise.fr", "creditagricole", "critique"],
    ["societe-generale-confirmer.com", "societegenerale", "critique"],
    ["bnp-paribas-virement.com", "bnpparibas", "critique"],
    ["cic-securise.com", "cic", "critique"],
    ["vintedhelp.com", "vinted", "importante"],
    ["lcl-banque.com", "lcl", "importante"],
    ["vinted.frr", "vinted", "importante"],
    ["lydia-coiffure.fr", "lydia", "attention"], // Lydia est aussi un prénom
  ])("%s", (url, marqueId, graviteAttendue) => {
    const r = analyser(url);
    expect(r.verdict).toBe("suspect");
    expect(r.marque?.id).toBe(marqueId);
    expect(gravite(r, "lien.imitation_marque")).toBe(graviteAttendue);
  });

  it("cite les mots d'appât trouvés", () => {
    const label = analyser("vinted-paiement-colis.com").signaux[0]?.label ?? "";
    expect(label).toContain("paiement");
    expect(label).toContain("colis");
  });

  it("ne prend pas les lettres de la marque pour des mots d'appât (Colissimo contient « colis »)", () => {
    // Sans mot d'appât à côté du nom, la gravité reste « importante », pas « critique ».
    expect(gravite(analyser("colissimo-boutique.net"), "lien.imitation_marque")).toBe("importante");
    expect(gravite(analyser("relais-colis-boutique.net"), "lien.imitation_marque")).toBe(
      "importante",
    );
    expect(gravite(analyser("colissimmo.fr"), "lien.typosquatting")).toBe("importante");
    expect(gravite(analyser("relaixcolis.fr"), "lien.typosquatting")).toBe("importante");
    // Avec un vrai mot d'appât, elle redevient critique.
    expect(gravite(analyser("colissimo-paiement.net"), "lien.imitation_marque")).toBe("critique");
    expect(gravite(analyser("colissimmo-paiement.net"), "lien.typosquatting")).toBe("critique");
    // Le libellé ne cite pas « colis » quand il vient du nom de la marque.
    expect(analyser("colissimo-boutique.net").signaux[0]?.label).not.toContain(
      "paiement ou à la livraison",
    );
  });

  it("une marque en sous-domaine d'un autre site est signalée", () => {
    const r = analyser("https://vinted.mon-site.com/x");
    expect(gravite(r, "lien.marque_sous_domaine")).toBe("importante");
    const avecAppat = analyser("https://vinted.paiement-securise.com");
    expect(gravite(avecAppat, "lien.marque_sous_domaine")).toBe("critique");
  });

  it("couvre chaque marque : nom + mot d'appât critique, nom seul au moins attention", () => {
    for (const marque of MARQUES) {
      const mot = marque.mots[0]!;
      const avecAppat = analyserLien(`https://${mot}-paiement.net/x`);
      expect(gravite(avecAppat, "lien.imitation_marque"), marque.id).toBe("critique");
      expect(avecAppat.marque?.id, marque.id).toBe(marque.id);
      const seul = analyserLien(`https://${mot}-boutique.net/x`);
      expect(
        rangGravite(gravite(seul, "lien.imitation_marque") ?? "info"),
        marque.id,
      ).toBeGreaterThanOrEqual(rangGravite("attention"));
    }
  });
});

describe("domaines volontairement hors liste blanche (non confirmés)", () => {
  it.each(["https://www.colissimo.com/", "https://www.chronopost.com/"])(
    "%s sort comme une imitation tant qu'il n'est pas confirmé",
    (url) => {
      const r = analyserLien(url);
      expect(r.verdict).toBe("suspect");
      expect(gravite(r, "lien.imitation_marque")).toBe("importante");
    },
  );

  it("mondialrelay-be.com (phishing réel) est suspect et jamais officiel", () => {
    const r = analyserLien("https://mondialrelay-be.com/suivi");
    expect(r.verdict).toBe("suspect");
    expect(r.marque?.id).toBe("mondialrelay");
    expect(r.domaine).toBe("mondialrelay-be.com");
  });
});

describe("typosquatting", () => {
  it.each([
    ["vlnted.fr", "vinted"],
    ["leboncoln.fr", "leboncoin"],
    ["1eboncoin.fr", "leboncoin"], // un « 1 » à la place du « l »
    ["Ieboncoin.fr", "leboncoin"], // un « I » majuscule à la place du « l »
    ["vinetd.fr", "vinted"], // lettres inversées
    ["mondialrelais.fr", "mondialrelay"],
    ["paypa1.com", "paypal"],
    ["colissimmo.fr", "colissimo"],
    ["chronopsot.fr", "chronopost"],
  ])("%s ressemble à %s", (url, marqueId) => {
    const r = analyser(url);
    expect(r.verdict).toBe("suspect");
    expect(r.marque?.id).toBe(marqueId);
    expect(gravite(r, "lien.typosquatting")).toBe("importante");
    expect(r.signaux[0]?.label).toContain("Vérifie bien chaque lettre");
  });

  it("devient critique avec un mot d'appât, même collé", () => {
    expect(gravite(analyser("vlnted-paiement.com"), "lien.typosquatting")).toBe("critique");
    expect(gravite(analyser("vlntedpaiement.com"), "lien.typosquatting")).toBe("critique");
    expect(gravite(analyser("leboncoln-securise.fr/pay"), "lien.typosquatting")).toBe("critique");
  });

  it("pèse moins quand seul un morceau du nom ressemble à la marque", () => {
    expect(gravite(analyser("vlnted-boutique.com"), "lien.typosquatting")).toBe("attention");
  });

  it("repère une altération d'une lettre de chaque marque (5 lettres et plus)", () => {
    for (const marque of MARQUES) {
      for (const mot of marque.mots.filter((m) => m.length >= 5)) {
        const milieu = Math.floor(mot.length / 2);
        const variante = `${mot.slice(0, milieu)}${mot[milieu] === "x" ? "z" : "x"}${mot.slice(milieu + 1)}`;
        const r = analyserLien(`https://${variante}.fr/`);
        expect(gravite(r, "lien.typosquatting"), variante).toBe("importante");
        expect(r.marque?.id, variante).toBe(marque.id);
      }
    }
  });

  it("ne touche pas aux noms courts : seul le mot entier compte", () => {
    for (const url of [
      "https://updated.com",
      "https://lcdl.fr",
      "https://medic.fr",
      "https://dpa.fr",
    ]) {
      expect(analyser(url).signaux, url).toEqual([]);
    }
  });
});

describe("pas de faux positifs sur des sites ordinaires", () => {
  it.each([
    "https://www.wikipedia.org/",
    "https://www.lemonde.fr/",
    "https://www.decathlon.fr/",
    "https://www.fnac.com/",
    "https://www.cdiscount.com/aide/livraison",
    "https://www.service-public.fr/",
    "https://www.ameli.fr/",
    "https://www.google.com/",
    "https://github.com/",
    "https://www.vintage-store.fr/",
    "https://www.collision-experts.fr/",
    "https://www.lecoincommode.fr/",
    "https://www.boncoindesaffaires.fr/",
    "https://www.updated.com/",
  ])("%s", (url) => {
    const r = analyser(url);
    expect(r.signaux, url).toEqual([]);
    expect(r.verdict).toBe("inconnu");
  });

  it("domaines sûrs : « connu », sans signal", () => {
    for (const url of [
      "https://www.lacoste.com/fr",
      "https://www.ups.com/track",
      "https://www.amazon.fr/",
    ]) {
      const r = analyser(url);
      expect(r.verdict, url).toBe("connu");
      expect(r.signaux, url).toEqual([]);
    }
  });
});

describe("l'analyse ne corrige pas les domaines suspects vers des domaines officiels", () => {
  it("vlnted.fr reste vlnted.fr", () => {
    const r = analyser("https://vlnted.fr/items/123");
    expect(r.domaine).toBe("vlnted.fr");
    expect(r.hote).toBe("vlnted.fr");
    expect(r.verdict).not.toBe("officiel");
  });

  it("aucun écart d'une lettre d'un domaine officiel n'est jamais « officiel »", () => {
    for (const domaine of OFFICIELS.keys()) {
      const [nom = "", ...suffixe] = domaine.split(".");
      for (const faux of [
        `${nom.replace(/i/g, "l")}.${suffixe.join(".")}`,
        `${nom.replace(/l/g, "1")}.${suffixe.join(".")}`,
      ]) {
        if (faux === domaine) continue;
        expect(analyserLien(`https://${faux}/`).verdict, faux).not.toBe("officiel");
      }
    }
  });
});

describe("noms de domaine internationaux", () => {
  it("un sosie visuel d'un domaine officiel est critique, avec un seul signal", () => {
    const r = analyser("https://vіnted.fr/"); // і cyrillique
    expect(r.hote).toBe("xn--vnted-n2e.fr");
    expect(r.signaux).toHaveLength(1);
    expect(gravite(r, "lien.caracteres_inhabituels")).toBe("critique");
    expect(r.marque?.id).toBe("vinted");
  });

  it("repère un sosie de marque dans un domaine non officiel", () => {
    const r = analyser("https://раураl-paiement.com/"); // р, а, у cyrilliques
    expect(gravite(r, "lien.caracteres_inhabituels")).toBe("critique");
    expect(r.marque?.id).toBe("paypal");
  });

  it("signale sans excès un nom international ordinaire", () => {
    const r = analyser("https://münchen.de/");
    expect(gravite(r, "lien.caracteres_inhabituels")).toBe("attention");
    expect(r.marque).toBeNull();
  });
});

describe("autres signaux", () => {
  it("raccourcisseurs", () => {
    const r = analyser("https://bit.ly/3xYz");
    expect(r.verdict).toBe("suspect");
    expect(gravite(r, "lien.raccourci")).toBe("importante");
  });

  it("adresse IP, y compris écrite en décimal", () => {
    expect(gravite(analyser("http://192.168.1.1/login"), "lien.adresse_ip")).toBe("importante");
    expect(gravite(analyser("http://2130706433/"), "lien.adresse_ip")).toBe("importante");
  });

  it("terminaisons à risque", () => {
    const r = analyser("https://random-site.xyz/page");
    expect(gravite(r, "lien.tld_suspect")).toBe("attention");
    expect(analyser("https://random-site.fr/page").signaux).toEqual([]);
  });

  it("mots d'appât seuls, sur un domaine inconnu", () => {
    const r = analyser("livraison-express.com");
    expect(gravite(r, "lien.mots_appat")).toBe("attention");
    expect(r.marque).toBeNull();
  });

  it("n'accuse pas un mot d'appât qui n'apparaît que dans le chemin", () => {
    expect(analyser("https://www.cdiscount.com/paiement/livraison").signaux).toEqual([]);
  });

  it("hébergement ouvert à tous", () => {
    expect(gravite(analyser("https://forms.gle/abc"), "lien.hebergement_ouvert")).toBe("attention");
    expect(
      gravite(analyser("https://docs.google.com/forms/d/abc"), "lien.hebergement_ouvert"),
    ).toBe("attention");
    expect(gravite(analyser("https://monsite.github.io"), "lien.hebergement_ouvert")).toBe(
      "attention",
    );
  });

  it("une marque dans le domaine d'un hébergeur ouvert cumule les signaux", () => {
    const r = analyser("https://vinted-paiement.pages.dev");
    expect(gravite(r, "lien.imitation_marque")).toBe("critique");
    expect(gravite(r, "lien.hebergement_ouvert")).toBe("attention");
  });

  it("marque dans le chemin", () => {
    const sansAppat = analyser("https://www.lemonde.fr/economie/vinted-valorisation");
    expect(gravite(sansAppat, "lien.marque_dans_chemin")).toBe("info");
    expect(sansAppat.verdict).toBe("inconnu");
    const avecAppat = analyser("https://sites.google.com/view/vinted-paiement");
    expect(gravite(avecAppat, "lien.marque_dans_chemin")).toBe("importante");
    expect(avecAppat.verdict).toBe("suspect");
  });

  it("adresse longue et pleine de tirets", () => {
    const r = analyser("https://a-b-c-d-e-f-g-h-i-j.com");
    expect(gravite(r, "lien.adresse_inhabituelle")).toBe("info");
    expect(r.verdict).toBe("inconnu");
  });

  it("âge du domaine, quand l'appelant le fournit", () => {
    const url = "https://boutique-exemple.com";
    expect(gravite(analyser(url, { ageDomaineJours: 5 }), "lien.domaine_recent")).toBe(
      "importante",
    );
    expect(gravite(analyser(url, { ageDomaineJours: 45 }), "lien.domaine_recent")).toBe(
      "attention",
    );
    expect(analyser(url, { ageDomaineJours: 200 }).signaux).toEqual([]);
    expect(analyser(url, { ageDomaineJours: null }).signaux).toEqual([]);
    expect(analyser(url).signaux).toEqual([]);
    expect(analyser("https://www.vinted.fr", { ageDomaineJours: 2 }).signaux).toEqual([]);
  });
});

describe("liens illisibles et forme du résultat", () => {
  it("renvoie « illisible » sans signal", () => {
    for (const brut of ["", "n'importe quoi", "javascript:alert(1)", "https://vinted,fr"]) {
      const r = analyser(brut);
      expect(r.verdict, brut).toBe("illisible");
      expect(r.signaux).toEqual([]);
      expect(r.adresse).toBeNull();
    }
  });

  it("garde le texte d'origine et les nettoyages appliqués", () => {
    const r = analyser("hxxps://vlnted[.]fr/pay");
    expect(r.entree).toBe("hxxps://vlnted[.]fr/pay");
    expect(r.adresse).toBe("https://vlnted.fr/pay");
    expect(r.modifications).toContain("defanging");
    expect(r.verdict).toBe("suspect");
  });

  it("trie les signaux du plus grave au moins grave", () => {
    const r = analyser("https://leboncoin.fr-livraison.xyz/pay");
    const rangs = r.signaux.map((s) => rangGravite(s.gravite));
    expect(rangs).toEqual([...rangs].sort((a, b) => b - a));
    expect(r.signaux.length).toBeGreaterThan(1);
  });

  it("ne produit que des signaux issus de règles, avec un identifiant connu", () => {
    for (const r of produits) {
      for (const s of r.signaux) {
        expect(s.source).toBe("regle");
        expect((IDS_SIGNAUX_LIENS as readonly string[]).includes(s.id), s.id).toBe(true);
      }
    }
  });

  it("analyserLiens écarte les doublons", () => {
    const resultats = analyserLiens([
      "vinted-paiement.com",
      "https://vinted-paiement.com/",
      "VINTED-PAIEMENT.COM",
      "https://autre-site.fr",
      "n'importe quoi",
      "n'importe quoi",
    ]);
    expect(resultats.map((r) => r.verdict)).toEqual(["suspect", "inconnu", "illisible"]);
  });
});

describe("wording et couverture", () => {
  it("chaque libellé produit passe le garde-fou de wording", () => {
    expect(produits.length).toBeGreaterThan(50);
    for (const r of produits) {
      for (const s of r.signaux) {
        expect(trouverFormulationsInterdites(s.label), s.label).toEqual([]);
        expect(s.label.trim()).not.toBe("");
      }
    }
  });

  it("chaque identifiant de signal est produit par au moins un cas de test", () => {
    const vus = new Set(produits.flatMap((r) => r.signaux.map((s) => s.id)));
    for (const id of IDS_SIGNAUX_LIENS) expect(vus.has(id), id).toBe(true);
  });

  it("ne qualifie jamais une personne : les libellés parlent de l'adresse", () => {
    for (const r of produits) {
      for (const s of r.signaux) expect(s.label).not.toMatch(/\b(?:vendeur|vendeuse|acheteur)\b/i);
    }
  });

  it("ne dépasse pas « suspect » pour un simple signal d'information", () => {
    const r = analyser("https://a-b-c-d-e-f-g-h-i-j.com");
    expect(pire(r)).toBe(rangGravite("info"));
    expect(r.verdict).toBe("inconnu");
  });
});
