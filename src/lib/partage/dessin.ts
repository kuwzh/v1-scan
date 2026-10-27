import { APP_NAME } from "../config";
import type { Gravite } from "../contracts/signals";
import type { Niveau } from "../contracts/niveau";
import { fr } from "../copy/fr";
import type { DonneesCarte } from "./carte";

/** Format d'une story (9:16). L'image est produite à cette taille exacte, quel que soit l'écran. */
export const LARGEUR = 1080;
export const HAUTEUR = 1920;

/**
 * Ce que le dessin utilise du contexte 2D. Un sous-ensemble : les tests passent un faux contexte
 * qui note ce qui est dessiné. Aucune méthode `drawImage` : la carte ne contient jamais de capture.
 */
export type Contexte2D = Pick<
  CanvasRenderingContext2D,
  | "fillStyle"
  | "strokeStyle"
  | "lineWidth"
  | "lineCap"
  | "lineJoin"
  | "font"
  | "textAlign"
  | "textBaseline"
  | "globalAlpha"
  | "save"
  | "restore"
  | "beginPath"
  | "arc"
  | "moveTo"
  | "lineTo"
  | "arcTo"
  | "closePath"
  | "fill"
  | "stroke"
  | "fillRect"
  | "fillText"
  | "measureText"
  | "createLinearGradient"
  | "createRadialGradient"
>;

/** Mêmes teintes que l'app (`--color-risk-*` de globals.css, converties en hexadécimal pour le canvas). */
export const COULEURS = {
  niveau: { faible: "#3fc168", moyen: "#f7a224", élevé: "#f1383e" } satisfies Record<
    Niveau,
    string
  >,
  gravite: {
    info: "#a3a3a3",
    attention: "#f7a224",
    importante: "#f97316",
    critique: "#f1383e",
  } satisfies Record<Gravite, string>,
  fondHaut: "#0a0a0a",
  fondBas: "#161616",
  carte: "#1f1f1f",
  blanc: "#fafafa",
  texte: "#e5e5e5",
  discret: "#a3a3a3",
  tresDiscret: "#737373",
  accent: "#4f46e5",
  accentClair: "#818cf8",
} as const;

/** La même pile de polices que l'app : elle est déjà présente sur l'appareil, rien à charger. */
export const POLICE =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const police = (poids: number, taille: number) => `${poids} ${taille}px ${POLICE}`;

const MARGE = 90;
const LARGEUR_UTILE = LARGEUR - 2 * MARGE;
const X_TEXTE = 150;
const LARGEUR_TEXTE = LARGEUR - MARGE - X_TEXTE;

const CENTRE_X = LARGEUR / 2;
const JAUGE = { cy: 660, rayon: 300, epaisseur: 56 } as const;
const Y_TITRE = JAUGE.cy + 180;
const HAUT_PASTILLES = Y_TITRE + 45;
const HAUTEUR_PASTILLE = 64;
const CTA = { haut: 1630, hauteur: 160 } as const;
/** Le contenu (signaux, rassurant) ne doit pas descendre sous cette ligne : l'accroche est dessous. */
const LIMITE_CONTENU = CTA.haut - 25;

interface Typo {
  taille: number;
  interligne: number;
  ecart: number;
}
/** Grande quand il y a de la place (peu de signaux), normale sinon. */
const SIGNAL_GRAND: Typo = { taille: 54, interligne: 64, ecart: 32 };
const SIGNAL_NORMAL: Typo = { taille: 44, interligne: 54, ecart: 22 };
const RASSURANT = { taille: 42, interligne: 52 } as const;

// Les trois zones suivent les seuils du score (0–29, 30–59, 60–100), avec un petit espace entre elles,
// comme la jauge de l'écran résultat.
const ZONES: ReadonlyArray<{ niveau: Niveau; debut: number; fin: number }> = [
  { niveau: "faible", debut: 0, fin: 0.29 },
  { niveau: "moyen", debut: 0.31, fin: 0.59 },
  { niveau: "élevé", debut: 0.61, fin: 1 },
];

export type Mesure = (texte: string) => number;

/**
 * Découpe `texte` en lignes d'au plus `largeur` pixels (mots entiers ; un mot plus long est coupé),
 * en `maxLignes` lignes au plus : la dernière finit par « … » si le texte est tronqué.
 */
export function decouperLignes(
  texte: string,
  largeur: number,
  mesurer: Mesure,
  maxLignes: number,
): string[] {
  const mots = texte.split(/\s+/).filter(Boolean);
  const lignes: string[] = [];
  let courante = "";
  const pousser = (ligne: string) => {
    if (ligne !== "") lignes.push(ligne);
  };
  for (const mot of mots) {
    const essai = courante === "" ? mot : `${courante} ${mot}`;
    if (mesurer(essai) <= largeur) {
      courante = essai;
      continue;
    }
    pousser(courante);
    courante = "";
    let reste = mot;
    while (mesurer(reste) > largeur && reste.length > 1) {
      let n = reste.length - 1;
      while (n > 1 && mesurer(reste.slice(0, n)) > largeur) n--;
      lignes.push(reste.slice(0, n));
      reste = reste.slice(n);
    }
    courante = reste;
  }
  pousser(courante);
  if (lignes.length <= maxLignes) return lignes;

  const gardees = lignes.slice(0, maxLignes);
  let derniere = gardees[maxLignes - 1] ?? "";
  while (derniere.length > 1 && mesurer(`${derniere}…`) > largeur) {
    derniere = derniere.slice(0, -1).trimEnd();
  }
  gardees[maxLignes - 1] = `${derniere}…`;
  return gardees;
}

function rectArrondi(
  ctx: Contexte2D,
  x: number,
  y: number,
  largeur: number,
  hauteur: number,
  rayon: number,
): void {
  const r = Math.min(rayon, largeur / 2, hauteur / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + largeur, y, x + largeur, y + hauteur, r);
  ctx.arcTo(x + largeur, y + hauteur, x, y + hauteur, r);
  ctx.arcTo(x, y + hauteur, x, y, r);
  ctx.arcTo(x, y, x + largeur, y, r);
  ctx.closePath();
}

function texte(
  ctx: Contexte2D,
  contenu: string,
  x: number,
  y: number,
  opts: { taille: number; poids: number; couleur: string; align?: CanvasTextAlign },
): void {
  ctx.font = police(opts.poids, opts.taille);
  ctx.fillStyle = opts.couleur;
  ctx.textAlign = opts.align ?? "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(contenu, x, y);
}

const TAILLE_MIN = 28;

/** Plus grande taille (jusqu'à `taille`, au moins `TAILLE_MIN`) pour laquelle `contenu` tient dans `largeur`. */
function tailleQuiTient(
  ctx: Contexte2D,
  contenu: string,
  poids: number,
  taille: number,
  largeur: number,
): number {
  let t = taille;
  ctx.font = police(poids, t);
  while (t > TAILLE_MIN && ctx.measureText(contenu).width > largeur) {
    t -= 2;
    ctx.font = police(poids, t);
  }
  return t;
}

/** Une ligne qui tient dans `largeur` : réduite d'abord, puis tronquée par « … » en dernier recours. */
function ligneQuiTient(
  ctx: Contexte2D,
  contenu: string,
  poids: number,
  taille: number,
  largeur: number,
): { texte: string; taille: number } {
  const t = tailleQuiTient(ctx, contenu, poids, taille, largeur);
  ctx.font = police(poids, t);
  const [ligne = contenu] = decouperLignes(contenu, largeur, (c) => ctx.measureText(c).width, 1);
  return { texte: ligne, taille: t };
}

function fond(ctx: Contexte2D, couleur: string): void {
  const degrade = ctx.createLinearGradient(0, 0, 0, HAUTEUR);
  degrade.addColorStop(0, COULEURS.fondHaut);
  degrade.addColorStop(1, COULEURS.fondBas);
  ctx.fillStyle = degrade;
  ctx.fillRect(0, 0, LARGEUR, HAUTEUR);
  // Halo de la couleur du niveau derrière la jauge.
  const halo = ctx.createRadialGradient(CENTRE_X, JAUGE.cy, 0, CENTRE_X, JAUGE.cy, 760);
  halo.addColorStop(0, `${couleur}40`);
  halo.addColorStop(1, `${couleur}00`);
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, LARGEUR, HAUTEUR);
}

function entete(ctx: Contexte2D, hote: string): void {
  // Marque : un écu avec une coche, puis le nom.
  rectArrondi(ctx, MARGE, 212, 76, 76, 20);
  ctx.fillStyle = COULEURS.accent;
  ctx.fill();
  const x = MARGE + 38;
  const y = 250;
  ctx.beginPath();
  ctx.moveTo(x, y - 26);
  ctx.lineTo(x + 22, y - 18);
  ctx.lineTo(x + 22, y + 2);
  ctx.lineTo(x, y + 26);
  ctx.lineTo(x - 22, y + 2);
  ctx.lineTo(x - 22, y - 18);
  ctx.closePath();
  ctx.fillStyle = COULEURS.blanc;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 9, y + 1);
  ctx.lineTo(x - 2, y + 9);
  ctx.lineTo(x + 11, y - 8);
  ctx.strokeStyle = COULEURS.accent;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  texte(ctx, APP_NAME, MARGE + 100, 272, { taille: 68, poids: 800, couleur: COULEURS.blanc });
  const adresse = ligneQuiTient(ctx, hote, 600, 38, 400);
  texte(ctx, adresse.texte, LARGEUR - MARGE, 270, {
    taille: adresse.taille,
    poids: 600,
    couleur: COULEURS.discret,
    align: "right",
  });
}

function jauge(ctx: Contexte2D, d: DonneesCarte): void {
  const { cy, rayon, epaisseur } = JAUGE;
  ctx.lineWidth = epaisseur;
  ctx.lineCap = "butt";
  for (const zone of ZONES) {
    ctx.beginPath();
    ctx.arc(CENTRE_X, cy, rayon, Math.PI * (1 + zone.debut), Math.PI * (1 + zone.fin));
    ctx.strokeStyle = COULEURS.niveau[zone.niveau];
    ctx.globalAlpha = zone.niveau === d.niveau ? 1 : 0.28;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Repère à la position du score.
  const angle = Math.PI * (1 + Math.max(0, Math.min(100, d.score)) / 100);
  ctx.beginPath();
  ctx.arc(CENTRE_X + rayon * Math.cos(angle), cy + rayon * Math.sin(angle), 34, 0, 2 * Math.PI);
  ctx.fillStyle = COULEURS.fondHaut;
  ctx.fill();
  ctx.lineWidth = 12;
  ctx.strokeStyle = COULEURS.niveau[d.niveau];
  ctx.stroke();

  texte(ctx, String(d.score), CENTRE_X, cy - 30, {
    taille: 220,
    poids: 800,
    couleur: COULEURS.blanc,
    align: "center",
  });
  texte(ctx, fr.ui.resultat.sur100, CENTRE_X, cy + 66, {
    taille: 46,
    poids: 500,
    couleur: COULEURS.discret,
    align: "center",
  });
  texte(ctx, d.titreNiveau, CENTRE_X, Y_TITRE, {
    taille: tailleQuiTient(ctx, d.titreNiveau, 800, 96, LARGEUR_UTILE),
    poids: 800,
    couleur: COULEURS.niveau[d.niveau],
    align: "center",
  });
}

/** Pastilles « Annonce Vinted » et « −65 % vs prix d'occasion habituel » ; renvoie le bas du bloc. */
function pastilles(ctx: Contexte2D, d: DonneesCarte): number | null {
  const contenus = [d.site, d.ecartPrix].filter((c): c is string => c !== null);
  if (contenus.length === 0) return null;
  const marge = 28;
  const ecart = 20;
  const mesures = contenus.map((c) => {
    const taille = tailleQuiTient(ctx, c, 600, 36, LARGEUR_UTILE - 2 * marge);
    ctx.font = police(600, taille);
    return { contenu: c, taille, largeur: ctx.measureText(c).width + 2 * marge };
  });
  const surUneLigne =
    mesures.reduce((somme, m) => somme + m.largeur, 0) + ecart * (mesures.length - 1) <=
    LARGEUR_UTILE;

  // Centrées : une ligne si elles tiennent, sinon l'une sous l'autre.
  const lignes = surUneLigne ? [mesures] : mesures.map((m) => [m]);
  let y = HAUT_PASTILLES;
  for (const ligne of lignes) {
    const total = ligne.reduce((somme, m) => somme + m.largeur, 0) + ecart * (ligne.length - 1);
    let x = CENTRE_X - total / 2;
    for (const m of ligne) {
      rectArrondi(ctx, x, y, m.largeur, HAUTEUR_PASTILLE, HAUTEUR_PASTILLE / 2);
      ctx.fillStyle = COULEURS.carte;
      ctx.fill();
      texte(ctx, m.contenu, x + m.largeur / 2, y + 44, {
        taille: m.taille,
        poids: 600,
        couleur: COULEURS.texte,
        align: "center",
      });
      x += m.largeur + ecart;
    }
    y += HAUTEUR_PASTILLE + ecart;
  }
  return y - ecart;
}

interface Tentative {
  signal: Typo;
  lignesParSignal: number;
  /** 0 : pas de rassurant. */
  lignesRassurant: number;
  avecAutres: boolean;
}

/** De la plus généreuse à la plus serrée : on n'en change que si le contenu déborde sur l'accroche. */
const TENTATIVES: readonly Tentative[] = [
  { signal: SIGNAL_GRAND, lignesParSignal: 2, lignesRassurant: 2, avecAutres: true },
  { signal: SIGNAL_NORMAL, lignesParSignal: 2, lignesRassurant: 2, avecAutres: true },
  { signal: SIGNAL_NORMAL, lignesParSignal: 2, lignesRassurant: 1, avecAutres: true },
  { signal: SIGNAL_NORMAL, lignesParSignal: 2, lignesRassurant: 1, avecAutres: false },
  { signal: SIGNAL_NORMAL, lignesParSignal: 1, lignesRassurant: 1, avecAutres: false },
  { signal: SIGNAL_NORMAL, lignesParSignal: 1, lignesRassurant: 0, avecAutres: false },
];

interface BlocSignal {
  lignes: string[];
  gravite: Gravite;
}

interface ContenuMesure {
  tentative: Tentative;
  signaux: BlocSignal[];
  rassurant: string[];
  avecAutres: boolean;
  fin: number;
}

function mesurerContenu(
  ctx: Contexte2D,
  d: DonneesCarte,
  haut: number,
  t: Tentative,
): ContenuMesure {
  const { signal: typo } = t;
  ctx.font = police(600, typo.taille);
  const mesurer: Mesure = (c) => ctx.measureText(c).width;
  let y = haut;
  const signaux = d.signaux.map((s) => {
    const lignes = decouperLignes(s.texte, LARGEUR_TEXTE, mesurer, t.lignesParSignal);
    y += lignes.length * typo.interligne + typo.ecart;
    return { lignes, gravite: s.gravite };
  });
  y -= typo.ecart;
  if (d.autres > 0 && t.avecAutres) y += 62;
  let rassurant: string[] = [];
  if (t.lignesRassurant > 0 && d.rassurant) {
    ctx.font = police(500, RASSURANT.taille);
    rassurant = decouperLignes(d.rassurant, LARGEUR_TEXTE, mesurer, t.lignesRassurant);
    y += 24 + rassurant.length * RASSURANT.interligne;
  }
  return { tentative: t, signaux, rassurant, avecAutres: d.autres > 0 && t.avecAutres, fin: y };
}

function signaux(ctx: Contexte2D, d: DonneesCarte, haut: number): number {
  const choisie =
    TENTATIVES.map((t) => mesurerContenu(ctx, d, haut, t)).find((m) => m.fin <= LIMITE_CONTENU) ??
    mesurerContenu(ctx, d, haut, TENTATIVES[TENTATIVES.length - 1] as Tentative);

  const typo = choisie.tentative.signal;
  let y = haut;
  for (const bloc of choisie.signaux) {
    ctx.beginPath();
    ctx.arc(MARGE + 22, y + typo.taille * 0.62, 13, 0, 2 * Math.PI);
    ctx.fillStyle = COULEURS.gravite[bloc.gravite];
    ctx.fill();
    bloc.lignes.forEach((ligne, i) => {
      texte(ctx, ligne, X_TEXTE, y + typo.taille * 0.9 + i * typo.interligne, {
        taille: typo.taille,
        poids: 600,
        couleur: COULEURS.blanc,
      });
    });
    y += bloc.lignes.length * typo.interligne + typo.ecart;
  }
  y -= typo.ecart;
  if (choisie.avecAutres) {
    texte(ctx, fr.partage.autresSignaux(d.autres), X_TEXTE, y + 54, {
      taille: 38,
      poids: 500,
      couleur: COULEURS.discret,
    });
    y += 62;
  }
  if (choisie.rassurant.length > 0) {
    y += 24;
    ctx.beginPath();
    ctx.arc(MARGE + 22, y + 26, 18, 0, 2 * Math.PI);
    ctx.fillStyle = COULEURS.niveau.faible;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(MARGE + 13, y + 26);
    ctx.lineTo(MARGE + 20, y + 33);
    ctx.lineTo(MARGE + 32, y + 19);
    ctx.strokeStyle = COULEURS.fondHaut;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    choisie.rassurant.forEach((ligne, i) => {
      texte(ctx, ligne, X_TEXTE, y + 40 + i * RASSURANT.interligne, {
        taille: RASSURANT.taille,
        poids: 500,
        couleur: COULEURS.texte,
      });
    });
    y += choisie.rassurant.length * RASSURANT.interligne;
  }
  return y;
}

function accroche(ctx: Contexte2D, d: DonneesCarte): void {
  rectArrondi(ctx, MARGE, CTA.haut, LARGEUR_UTILE, CTA.hauteur, 40);
  ctx.fillStyle = COULEURS.accent;
  ctx.fill();
  const largeur = LARGEUR_UTILE - 80;
  texte(ctx, d.accroche, CENTRE_X, CTA.haut + 62, {
    taille: tailleQuiTient(ctx, d.accroche, 700, 46, largeur),
    poids: 700,
    couleur: COULEURS.blanc,
    align: "center",
  });
  const ligne = ligneQuiTient(ctx, `→ ${d.hote}`, 800, 58, largeur);
  texte(ctx, ligne.texte, CENTRE_X, CTA.haut + 128, {
    taille: ligne.taille,
    poids: 800,
    couleur: COULEURS.blanc,
    align: "center",
  });
  texte(ctx, d.mention, CENTRE_X, 1852, {
    taille: 32,
    poids: 500,
    couleur: COULEURS.tresDiscret,
    align: "center",
  });
}

export interface MesuresCarte {
  /** Bas du dernier élément de contenu (signaux, rassurant). */
  finContenu: number;
  /** Haut du bloc d'accroche. */
  debutAccroche: number;
}

/**
 * Dessine la carte de partage sur un canvas de `LARGEUR` × `HAUTEUR`. Tout ce qui s'affiche vient
 * de `donnees` : texte et formes, jamais une image (donc jamais la capture).
 */
export function dessinerCarte(ctx: Contexte2D, donnees: DonneesCarte): MesuresCarte {
  ctx.save();
  fond(ctx, COULEURS.niveau[donnees.niveau]);
  entete(ctx, donnees.hote);
  jauge(ctx, donnees);
  const basPastilles = pastilles(ctx, donnees);
  const haut = (basPastilles ?? Y_TITRE) + 56;
  const finContenu = signaux(ctx, donnees, haut);
  accroche(ctx, donnees);
  ctx.restore();
  return { finContenu, debutAccroche: CTA.haut };
}
