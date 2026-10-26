/**
 * Terminaisons souvent vues sur des sites éphémères ou des campagnes de faux sites.
 * Ce n'est pas une preuve : un signal faible, jamais suffisant seul.
 */
export const TLD_SUSPECTS: ReadonlySet<string> = new Set([
  "xyz",
  "top",
  "click",
  "icu",
  "buzz",
  "cfd",
  "sbs",
  "bond",
  "quest",
  "rest",
  "monster",
  "cyou",
  "lol",
  "work",
  "support",
  "link",
  "vip",
  "wang",
  "win",
  "loan",
  "download",
  "stream",
  "review",
  "date",
  "party",
  "zip",
  "mov",
  "tk",
  "ml",
  "ga",
  "cf",
  "gq",
  "cc",
  "pw",
  "online",
  "site",
  "fun",
  "space",
  "live",
]);

/** Raccourcisseurs d'URL : la destination réelle est cachée. */
export const RACCOURCISSEURS: ReadonlySet<string> = new Set([
  "bit.ly",
  "bitly.com",
  "tinyurl.com",
  "t.co",
  "cutt.ly",
  "is.gd",
  "v.gd",
  "rb.gy",
  "rebrand.ly",
  "shorturl.at",
  "ow.ly",
  "buff.ly",
  "t.ly",
  "tiny.cc",
  "goo.gl",
  "lnkd.in",
  "s.id",
  "urlz.fr",
  "bl.ink",
  "qrco.de",
  "qr.net",
  "short.io",
  "shorturl.com",
]);

/**
 * Services où n'importe qui peut publier une page ou un formulaire, et dont le domaine
 * principal est quand même légitime (donc absent des suffixes privés de la PSL).
 */
export const HEBERGEMENTS_OUVERTS: readonly string[] = [
  "sites.google.com",
  "docs.google.com",
  "drive.google.com",
  "forms.gle",
  "forms.office.com",
  "linktr.ee",
  "carrd.co",
  "canva.site",
  "notion.site",
  "typeform.com",
  "jotform.com",
];

/** Renvoie le service d'hébergement ouvert dont `hote` fait partie, sinon `null`. */
export function trouverHebergementOuvert(hote: string): string | null {
  return HEBERGEMENTS_OUVERTS.find((h) => hote === h || hote.endsWith(`.${h}`)) ?? null;
}
