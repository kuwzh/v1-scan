/** Décodage punycode (RFC 3492) pour afficher et comparer les noms de domaine internationaux. */
const BASE = 36;
const TMIN = 1;
const TMAX = 26;
const SKEW = 38;
const DAMP = 700;
const BIAS_INITIAL = 72;
const N_INITIAL = 128;

function adapter(delta: number, nombrePoints: number, premier: boolean): number {
  let d = premier ? Math.floor(delta / DAMP) : delta >> 1;
  d += Math.floor(d / nombrePoints);
  let k = 0;
  while (d > ((BASE - TMIN) * TMAX) >> 1) {
    d = Math.floor(d / (BASE - TMIN));
    k += BASE;
  }
  return Math.floor(k + ((BASE - TMIN + 1) * d) / (d + SKEW));
}

function chiffre(code: number): number {
  if (code >= 0x30 && code <= 0x39) return code - 0x30 + 26; // 0-9
  if (code >= 0x41 && code <= 0x5a) return code - 0x41; // A-Z
  if (code >= 0x61 && code <= 0x7a) return code - 0x61; // a-z
  return BASE;
}

/** Décode une étiquette punycode (sans le préfixe `xn--`). Renvoie `null` si elle est invalide. */
export function decoderPunycode(entree: string): string | null {
  const sortie: number[] = [];
  const delimiteur = entree.lastIndexOf("-");
  for (let j = 0; j < Math.max(delimiteur, 0); j++) {
    const code = entree.charCodeAt(j);
    if (code >= 0x80) return null;
    sortie.push(code);
  }

  let n = N_INITIAL;
  let i = 0;
  let biais = BIAS_INITIAL;
  for (let index = delimiteur > 0 ? delimiteur + 1 : 0; index < entree.length;) {
    const ancienI = i;
    for (let w = 1, k = BASE; ; k += BASE) {
      if (index >= entree.length) return null;
      const d = chiffre(entree.charCodeAt(index++));
      if (d >= BASE) return null;
      i += d * w;
      const t = k <= biais ? TMIN : k >= biais + TMAX ? TMAX : k - biais;
      if (d < t) break;
      w *= BASE - t;
    }
    const sortieLongueur = sortie.length + 1;
    biais = adapter(i - ancienI, sortieLongueur, ancienI === 0);
    n += Math.floor(i / sortieLongueur);
    i %= sortieLongueur;
    if (n > 0x10ffff) return null;
    sortie.splice(i++, 0, n);
  }
  try {
    return String.fromCodePoint(...sortie);
  } catch {
    return null;
  }
}

export function contientPunycode(hote: string): boolean {
  return hote.split(".").some((etiquette) => etiquette.startsWith("xn--"));
}

/** Version Unicode d'un hôte : les étiquettes `xn--…` sont décodées, les autres inchangées. */
export function hoteVersUnicode(hote: string): string {
  return hote
    .split(".")
    .map((etiquette) => {
      if (!etiquette.startsWith("xn--")) return etiquette;
      return decoderPunycode(etiquette.slice(4)) ?? etiquette;
    })
    .join(".");
}
