/**
 * Distance d'édition de Levenshtein, avec la transposition de deux lettres voisines
 * comptée pour 1 (« vinetd » → « vinted »), car c'est une faute de frappe courante.
 * S'arrête dès que `max` est dépassé et renvoie alors `max + 1`.
 */
export function distanceEdition(a: string, b: string, max = Number.POSITIVE_INFINITY): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let avant: number[] = [];
  let courant: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const precedent = avant;
    avant = courant;
    courant = [i];
    let minLigne = i;
    for (let j = 1; j <= b.length; j++) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min((avant[j] ?? 0) + 1, (courant[j - 1] ?? 0) + 1, (avant[j - 1] ?? 0) + cout);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d = Math.min(d, (precedent[j - 2] ?? 0) + 1);
      }
      courant[j] = d;
      if (d < minLigne) minLigne = d;
    }
    if (minLigne > max) return max + 1;
  }
  return courant[b.length] ?? max + 1;
}

/** Lettres d'autres alphabets qui ressemblent à des lettres latines. */
const CONFONDABLES: Readonly<Record<string, string>> = {
  // cyrillique
  а: "a",
  в: "b",
  с: "c",
  ԁ: "d",
  е: "e",
  һ: "h",
  і: "i",
  ї: "i",
  ј: "j",
  к: "k",
  ӏ: "l",
  м: "m",
  н: "h",
  о: "o",
  р: "p",
  ԛ: "q",
  ѕ: "s",
  т: "t",
  ѵ: "v",
  ԝ: "w",
  х: "x",
  у: "y",
  // grec
  α: "a",
  β: "b",
  ε: "e",
  ι: "i",
  κ: "k",
  ν: "v",
  ο: "o",
  ρ: "p",
  τ: "t",
  υ: "u",
  χ: "x",
  // latin étendu
  ı: "i",
  ɡ: "g",
  ℓ: "l",
  ɩ: "i",
  ꞵ: "b",
};

/**
 * « Squelette » d'un texte pour comparer des adresses : minuscules, accents retirés,
 * lettres d'autres alphabets ramenées à leur sosie latin. Ne sert qu'à comparer :
 * on ne l'utilise jamais pour réécrire une adresse.
 */
export function squelette(texte: string): string {
  const sansAccents = texte.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  let sortie = "";
  for (const c of sansAccents) sortie += CONFONDABLES[c] ?? c;
  return sortie;
}

/**
 * Repli des caractères qu'on confond à l'œil ou à l'OCR (i / l / 1 / |, o / 0, rn / m…).
 * Deux textes qui ne diffèrent que par ces caractères ont le même repli.
 */
export function replierConfusables(texte: string): string {
  return squelette(texte)
    .replace(/rn/g, "m")
    .replace(/vv/g, "w")
    .replace(/[i1|]/g, "l")
    .replace(/0/g, "o")
    .replace(/3/g, "e")
    .replace(/5/g, "s");
}

/** Ne garde que les lettres et chiffres ASCII (après squelette). */
export function compacter(texte: string): string {
  return squelette(texte).replace(/[^a-z0-9]/g, "");
}
