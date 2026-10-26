import { MAX_URL_CHARS } from "../contracts/limits";
import { rangGravite, type Gravite, type Signal } from "../contracts/signals";
import { fr } from "../copy/fr";
import { analyserHote } from "./domain";
import { RACCOURCISSEURS, TLD_SUSPECTS, trouverHebergementOuvert } from "./listes";
import { DOMAINES_SURS, MARQUES, MARQUES_COMPACTES, OFFICIELS, type Marque } from "./marques";
import { chercherAppats } from "./mots";
import { normaliserLien } from "./normalize";
import { contientPunycode, hoteVersUnicode } from "./punycode";
import { compacter, distanceEdition, replierConfusables, squelette } from "./similarite";
import type { LienAnalyse, MarqueVisee } from "./types";

/** Identifiants de tous les signaux que l'analyse de liens peut produire. */
export const IDS_SIGNAUX_LIENS = [
  "lien.sous_domaine_piege",
  "lien.identifiants_trompeurs",
  "lien.imitation_marque",
  "lien.marque_sous_domaine",
  "lien.typosquatting",
  "lien.marque_dans_chemin",
  "lien.raccourci",
  "lien.adresse_ip",
  "lien.caracteres_inhabituels",
  "lien.tld_suspect",
  "lien.mots_appat",
  "lien.hebergement_ouvert",
  "lien.adresse_inhabituelle",
  "lien.domaine_recent",
] as const;
export type IdSignalLien = (typeof IDS_SIGNAUX_LIENS)[number];

export interface OptionsAnalyseLien {
  /**
   * Âge du nom de domaine en jours, quand on a pu le connaître (RDAP). L'analyse reste
   * purement statique : ce module ne fait aucune requête réseau.
   */
  ageDomaineJours?: number | null;
}

function signal(id: IdSignalLien, label: string, gravite: Gravite): Signal {
  return { id, label, gravite, source: "regle" };
}

function tokensDe(texte: string): string[] {
  return squelette(texte)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Vrai si `reste` n'est composé que de mots d'appât (« colis », « paiement »…). */
function estToutAppat(reste: string): boolean {
  if (reste === "") return false;
  const trouve = chercherAppats(reste);
  return trouve.mots.length > 0 && trouve.reste === "";
}

/**
 * La marque est-elle nommée telle quelle ? Les noms de 5 lettres ou plus se cherchent
 * dans le texte compact (« mondial-relay » → « mondialrelay »). Les noms courts (DPD,
 * LCL, CIC) ne comptent que comme mot entier, ou collés à un mot d'appât (« dpdcolis »).
 */
function correspondExact(marque: Marque, compact: string, tokens: readonly string[]): boolean {
  for (const mot of MARQUES_COMPACTES.get(marque.id) ?? []) {
    if (mot.length >= 5) {
      if (compact.includes(mot)) return true;
      continue;
    }
    for (const t of tokens) {
      if (t === mot) return true;
      if (t.startsWith(mot) && estToutAppat(t.slice(mot.length))) return true;
      if (t.endsWith(mot) && estToutAppat(t.slice(0, t.length - mot.length))) return true;
    }
  }
  return false;
}

function marquesExactes(texte: string): Marque[] {
  const compact = compacter(texte);
  const tokens = tokensDe(texte);
  return MARQUES.filter((m) => correspondExact(m, compact, tokens));
}

/**
 * Le nom est-il une quasi-copie de la marque (typosquatting) ? Distance d'édition de
 * 1 pour les noms de 5 à 7 lettres, 2 au-delà : une tolérance fixe de 2 ferait
 * ressembler n'importe quel mot court à « paypal » ou « lydia ». Les caractères qu'on
 * confond à l'œil ou à l'OCR (i/l/1, o/0, rn/m) sont comparés après repli.
 *
 * `entier` : toute l'étiquette (avec ou sans mots d'appât) est la quasi-copie ; sinon
 * seul un morceau séparé par des tirets l'est.
 */
function correspondApprox(
  marque: Marque,
  etiquette: string,
): { entier: boolean; appats: string[] } | null {
  const compact = compacter(etiquette);
  const trouve = chercherAppats(compact);
  const sansAppat = trouve.reste;
  const tokens = tokensDe(etiquette);
  for (const mot of MARQUES_COMPACTES.get(marque.id) ?? []) {
    if (mot.length < 5) continue;
    const seuil = mot.length <= 7 ? 1 : 2;
    const motReplie = replierConfusables(mot);
    const proche = (c: string) =>
      c.length > 0 &&
      c !== mot &&
      (distanceEdition(c, mot, seuil) <= seuil ||
        distanceEdition(replierConfusables(c), motReplie, seuil) <= seuil);
    // Étiquette entière ≈ marque : les lettres de la marque ne comptent pas comme mots d'appât
    // (« colissimmo » contient « colis »).
    if (proche(compact)) return { entier: true, appats: [] };
    if (sansAppat !== compact && proche(sansAppat)) return { entier: true, appats: trouve.mots };
    if (tokens.length > 1) {
      const i = tokens.findIndex(proche);
      if (i >= 0) {
        const autres = tokens.filter((_, j) => j !== i).join(" ");
        return { entier: false, appats: chercherAppats(autres).mots };
      }
    }
  }
  return null;
}

/**
 * Mots d'appât présents dans `texte` une fois retirées les lettres de la marque elle-même :
 * « Colissimo » et « Relais Colis » contiennent « colis », qui ne doit pas compter.
 */
function appatsHorsMarque(texte: string, marque: Marque): string[] {
  const mots = MARQUES_COMPACTES.get(marque.id) ?? [];
  const morceaux: string[] = [];

  // Noms de 5 lettres et plus : retirés du texte compact, même coupés par un tiret
  // (« relais-colis » → « relaiscolis »). Les morceaux restants sont analysés à part pour
  // que les lettres qui entouraient le nom ne se recollent pas en faux mot d'appât.
  const longs = mots.filter((m) => m.length >= 5);
  if (longs.length > 0) {
    let compact = compacter(texte);
    for (const mot of longs) compact = compact.split(mot).join(" ");
    morceaux.push(...compact.split(" "));
  }

  // Noms courts (DPD, LCL, CIC) : retirés mot par mot.
  const courts = mots.filter((m) => m.length < 5);
  if (courts.length > 0) {
    for (const t of tokensDe(texte)) {
      let reste = t;
      for (const mot of courts) {
        if (t === mot) reste = "";
        else if (t.startsWith(mot)) reste = t.slice(mot.length);
        else if (t.endsWith(mot)) reste = t.slice(0, t.length - mot.length);
      }
      morceaux.push(reste);
    }
  }

  return [...new Set(morceaux.filter(Boolean).flatMap((m) => chercherAppats(m).mots))];
}

/**
 * Cherche un domaine officiel écrit dans `texte` sans en être le vrai domaine :
 * `vinted.fr.paiement-securise.com`, `leboncoin.fr-livraison.xyz`. Le domaine doit être
 * délimité (début, `.` ou `-` avant ; fin, `.` ou `-` après) pour que `sdpd.fr` ne passe
 * pas pour `dpd.fr`.
 */
function trouverPiege(texte: string): { officiel: string; marque: Marque } | null {
  for (const [officiel, marque] of OFFICIELS) {
    let i = texte.indexOf(officiel);
    while (i !== -1) {
      const avant = texte.charAt(i - 1);
      const apres = texte.charAt(i + officiel.length);
      const debutOk = i === 0 || avant === "." || avant === "-";
      const finOk = apres === "" || apres === "." || apres === "-";
      if (debutOk && finOk) return { officiel, marque };
      i = texte.indexOf(officiel, i + 1);
    }
  }
  return null;
}

function visee(marque: Marque | null): MarqueVisee | null {
  return marque ? { id: marque.id, nom: marque.nom } : null;
}

/**
 * Analyse statique d'un lien : aucune requête n'est faite vers l'adresse. Le lien est
 * d'abord nettoyé (sans jamais corriger les lettres), puis comparé à la liste blanche
 * des domaines officiels, aux marques imitées, aux raccourcisseurs, aux terminaisons
 * à risque, etc.
 */
export function analyserLien(brut: string, options: OptionsAnalyseLien = {}): LienAnalyse {
  const entree = brut.slice(0, MAX_URL_CHARS);
  const n = normaliserLien(brut);
  if (!n.ok) {
    return {
      entree,
      adresse: null,
      hote: null,
      domaine: null,
      verdict: "illisible",
      marque: null,
      signaux: [],
      modifications: n.modifications,
    };
  }

  const ha = analyserHote(n.hote);
  const base = {
    entree,
    adresse: n.href,
    hote: ha.hote,
    domaine: ha.domaine,
    modifications: n.modifications,
  };

  // 1. Liste blanche : un domaine officiel (ou l'un de ses sous-domaines) ne lève aucun signal.
  const officiel = ha.domaine ? OFFICIELS.get(ha.domaine) : undefined;
  if (officiel) {
    return { ...base, verdict: "officiel", marque: visee(officiel), signaux: [] };
  }
  if (ha.domaine && DOMAINES_SURS.has(ha.domaine)) {
    return { ...base, verdict: "connu", marque: null, signaux: [] };
  }

  const signaux: Signal[] = [];
  let marque: Marque | null = null;
  const retenir = (m: Marque) => {
    marque ??= m;
  };
  const terminer = (): LienAnalyse => {
    signaux.sort((a, b) => rangGravite(b.gravite) - rangGravite(a.gravite));
    const suspect = signaux.some((s) => rangGravite(s.gravite) >= rangGravite("attention"));
    return {
      ...base,
      verdict: suspect ? "suspect" : "inconnu",
      marque: visee(marque),
      signaux,
      modifications: base.modifications,
    };
  };

  const domaine = ha.domaine ?? ha.hote;

  // 2. Raccourcisseurs et adresses IP : la destination est opaque, on s'arrête là.
  if (ha.domaine && RACCOURCISSEURS.has(ha.domaine)) {
    signaux.push(signal("lien.raccourci", fr.liens.raccourci(ha.domaine), "importante"));
    return terminer();
  }
  if (ha.estIp) {
    signaux.push(signal("lien.adresse_ip", fr.liens.adresseIp(), "importante"));
    return terminer();
  }

  // Pour un nom international on analyse la forme décodée, jamais le `xn--…` brut.
  const idn = contientPunycode(ha.hote);
  const etiquette = idn ? squelette(hoteVersUnicode(ha.etiquette || domaine)) : ha.etiquette;
  const texteHote = `${ha.sousDomaine} ${etiquette}`;
  /** Mots d'appât de l'adresse, lettres de marque comprises : sert seulement sans marque. */
  const appatsHote = chercherAppats(texteHote).mots;
  let signalMarque = false;

  // 3. Identifiants avant un « @ » : `https://vinted.fr@site.com` mène vers site.com.
  if (n.identifiant) {
    const id = n.identifiant.toLowerCase();
    const piegeId = trouverPiege(id);
    const marqueId = piegeId?.marque ?? marquesExactes(id)[0] ?? null;
    if (marqueId) {
      const affiche = piegeId?.officiel ?? (/^[a-z0-9.-]{1,60}$/.test(id) ? id : marqueId.nom);
      signaux.push(
        signal(
          "lien.identifiants_trompeurs",
          fr.liens.identifiantsTrompeurs(affiche, domaine),
          "critique",
        ),
      );
      retenir(marqueId);
      signalMarque = true;
    } else {
      signaux.push(
        signal(
          "lien.identifiants_trompeurs",
          fr.liens.identifiantsInhabituels(domaine),
          "attention",
        ),
      );
    }
  }

  // 4. Piège du sous-domaine : un domaine officiel écrit devant un autre domaine.
  const piege = trouverPiege(ha.hote);
  if (piege) {
    signaux.push(
      signal(
        "lien.sous_domaine_piege",
        fr.liens.sousDomainePiege(piege.officiel, domaine),
        "critique",
      ),
    );
    retenir(piege.marque);
    signalMarque = true;
  }

  // 5. Noms de domaine internationaux : lettres d'un autre alphabet qui imitent des lettres latines.
  if (idn) {
    const sosie = OFFICIELS.get(squelette(hoteVersUnicode(domaine)));
    const imitee = sosie ?? marquesExactes(etiquette)[0] ?? null;
    const gravite: Gravite = sosie
      ? "critique"
      : imitee
        ? appatsHorsMarque(texteHote, imitee).length > 0
          ? "critique"
          : "importante"
        : "attention";
    signaux.push(
      signal(
        "lien.caracteres_inhabituels",
        fr.liens.caracteresInhabituels(domaine, imitee?.nom ?? null),
        gravite,
      ),
    );
    if (imitee) {
      retenir(imitee);
      signalMarque = true;
    }
  }

  // 6. Marque dans le domaine : nom repris tel quel, puis quasi-copie, puis sous-domaine.
  if (!piege && !signalMarque) {
    const exacte = marquesExactes(etiquette)[0];
    if (exacte) {
      const appats = appatsHorsMarque(texteHote, exacte);
      const gravite: Gravite =
        appats.length > 0 ? "critique" : exacte.ambigu ? "attention" : "importante";
      signaux.push(
        signal(
          "lien.imitation_marque",
          fr.liens.imitationMarque(exacte.nom, domaine, appats),
          gravite,
        ),
      );
      retenir(exacte);
      signalMarque = true;
    } else {
      let meilleure: { marque: Marque; entier: boolean; appats: string[] } | null = null;
      for (const m of MARQUES) {
        const a = correspondApprox(m, etiquette);
        if (a && (!meilleure || (a.entier && !meilleure.entier))) {
          const appats = [...new Set([...a.appats, ...chercherAppats(ha.sousDomaine).mots])];
          meilleure = { marque: m, entier: a.entier, appats };
        }
      }
      // Un nom très courant (Lydia) proche d'un prénom : on ne le relève qu'avec un mot d'appât.
      if (
        meilleure &&
        !(meilleure.marque.ambigu && !meilleure.entier && meilleure.appats.length === 0)
      ) {
        const gravite: Gravite =
          meilleure.appats.length > 0 ? "critique" : meilleure.entier ? "importante" : "attention";
        signaux.push(
          signal(
            "lien.typosquatting",
            fr.liens.ressemblanceMarque(meilleure.marque.nom, domaine, meilleure.appats),
            gravite,
          ),
        );
        retenir(meilleure.marque);
        signalMarque = true;
      } else if (ha.sousDomaine) {
        const dansSousDomaine = ha.sousDomaine
          .split(".")
          .flatMap((partie) => marquesExactes(partie))[0];
        if (dansSousDomaine) {
          const appats = appatsHorsMarque(texteHote, dansSousDomaine);
          const gravite: Gravite =
            appats.length > 0 ? "critique" : dansSousDomaine.ambigu ? "attention" : "importante";
          signaux.push(
            signal(
              "lien.marque_sous_domaine",
              fr.liens.marqueSousDomaine(dansSousDomaine.nom, domaine, appats),
              gravite,
            ),
          );
          retenir(dansSousDomaine);
          signalMarque = true;
        }
      }
    }
  }

  // 7. Marque seulement dans le chemin : `site.com/vinted/paiement`.
  if (!signalMarque) {
    const dansChemin = marquesExactes(n.chemin)[0];
    if (dansChemin) {
      const appat =
        appatsHorsMarque(texteHote, dansChemin).length > 0 ||
        appatsHorsMarque(n.chemin, dansChemin).length > 0;
      if (appat) {
        signaux.push(
          signal(
            "lien.marque_dans_chemin",
            fr.liens.marqueDansChemin(dansChemin.nom, domaine),
            "importante",
          ),
        );
        retenir(dansChemin);
        signalMarque = true;
      } else if (!dansChemin.ambigu) {
        signaux.push(
          signal(
            "lien.marque_dans_chemin",
            fr.liens.marqueDansChemin(dansChemin.nom, domaine),
            "info",
          ),
        );
        retenir(dansChemin);
      }
    }
  }

  // 8. Terminaison, hébergement ouvert, forme de l'adresse.
  if (ha.domaine && !ha.suffixePrive) {
    const tld = ha.suffixe?.split(".").pop();
    if (tld && TLD_SUSPECTS.has(tld)) {
      signaux.push(signal("lien.tld_suspect", fr.liens.tldSuspect(tld), "attention"));
    }
  }
  const hebergement = ha.suffixePrive ? ha.suffixe : trouverHebergementOuvert(ha.hote);
  if (hebergement) {
    signaux.push(
      signal("lien.hebergement_ouvert", fr.liens.hebergementOuvert(hebergement), "attention"),
    );
  }
  if (!signalMarque && appatsHote.length > 0) {
    signaux.push(signal("lien.mots_appat", fr.liens.motsAppat(domaine, appatsHote), "attention"));
  }
  if ((etiquette.match(/-/g)?.length ?? 0) >= 3 || etiquette.length > 30) {
    signaux.push(
      signal("lien.adresse_inhabituelle", fr.liens.adresseInhabituelle(domaine), "info"),
    );
  }

  // 9. Âge du domaine, quand l'appelant l'a obtenu (RDAP).
  const age = options.ageDomaineJours;
  if (typeof age === "number" && Number.isFinite(age) && age >= 0 && age < 90) {
    signaux.push(
      signal(
        "lien.domaine_recent",
        fr.liens.domaineRecent(Math.floor(age)),
        age < 30 ? "importante" : "attention",
      ),
    );
  }

  return terminer();
}

/** Analyse plusieurs liens en écartant les doublons (même adresse nettoyée). */
export function analyserLiens(
  bruts: readonly string[],
  options: OptionsAnalyseLien = {},
): LienAnalyse[] {
  const vus = new Set<string>();
  const resultats: LienAnalyse[] = [];
  for (const brut of bruts) {
    const analyse = analyserLien(brut, options);
    const cle = analyse.adresse ?? `illisible:${analyse.entree}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    resultats.push(analyse);
  }
  return resultats;
}
