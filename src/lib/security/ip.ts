import { createHmac } from "node:crypto";

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
export const IP_INCONNUE = "inconnue";

function ipv4Valide(brut: string): string | null {
  const m = IPV4.exec(brut);
  if (!m) return null;
  const octets = m.slice(1, 5).map(Number);
  return octets.every((o) => o <= 255) ? octets.join(".") : null;
}

/** Développe une adresse IPv6 en 8 groupes de 16 bits, ou `null` si elle est invalide. */
function groupesIpv6(brut: string): number[] | null {
  let texte = brut;
  // Forme mixte (::ffff:1.2.3.4) : les 4 octets finaux valent deux groupes.
  const dernier = texte.slice(texte.lastIndexOf(":") + 1);
  if (dernier.includes(".")) {
    const v4 = ipv4Valide(dernier);
    if (!v4) return null;
    const [a = 0, b = 0, c = 0, d = 0] = v4.split(".").map(Number);
    texte = `${texte.slice(0, texte.lastIndexOf(":") + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const parties = texte.split("::");
  if (parties.length > 2) return null;
  const separer = (s: string) => (s === "" ? [] : s.split(":"));
  const debut = separer(parties[0] ?? "");
  const fin = separer(parties[1] ?? "");
  const manquants = 8 - debut.length - fin.length;
  if (parties.length === 1 ? manquants !== 0 : manquants < 1) return null;
  const tous = [...debut, ...Array<string>(parties.length === 2 ? manquants : 0).fill("0"), ...fin];
  const valeurs = tous.map((g) => (/^[0-9a-f]{1,4}$/i.test(g) ? parseInt(g, 16) : Number.NaN));
  return valeurs.length === 8 && valeurs.every((v) => !Number.isNaN(v)) ? valeurs : null;
}

/**
 * Ramène une adresse à l'identité qu'on limite :
 * - IPv4 : l'adresse ;
 * - IPv4 encapsulée dans de l'IPv6 : l'adresse IPv4 ;
 * - IPv6 : le préfixe /64, car un abonné en reçoit des milliards et pourrait en changer à
 *   chaque requête pour contourner la limite ;
 * - tout le reste : `inconnue` (ces requêtes partagent alors une seule limite).
 */
export function normaliserIp(brut: string): string {
  let ip = brut.trim();
  const entreCrochets = /^\[([^\]]+)\](?::\d+)?$/.exec(ip);
  const ipv4AvecPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(ip);
  if (entreCrochets?.[1]) ip = entreCrochets[1];
  else if (ipv4AvecPort?.[1]) ip = ipv4AvecPort[1];
  ip = ip.replace(/%.*$/, "");

  const v4 = ipv4Valide(ip);
  if (v4) return v4;
  if (!ip.includes(":")) return IP_INCONNUE;
  const g = groupesIpv6(ip);
  if (!g) return IP_INCONNUE;
  const [g0, g1, g2, g3, g4, g5, g6, g7] = g as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
    return `${g6 >> 8}.${g6 & 255}.${g7 >> 8}.${g7 & 255}`;
  }
  return `${[g0, g1, g2, g3].map((x) => x.toString(16)).join(":")}::/64`;
}

/**
 * Adresse du visiteur. Sur Vercel, `x-forwarded-for` est réécrit par la plateforme (le client
 * ne peut pas l'imposer). Ailleurs, n'exposer l'application que derrière un proxy de confiance :
 * sinon l'en-tête est falsifiable et la limite contournable.
 */
export function extraireIp(entetes: Headers): string {
  const brut =
    entetes.get("x-vercel-forwarded-for") ??
    entetes.get("x-real-ip") ??
    entetes.get("x-forwarded-for")?.split(",")[0] ??
    "";
  return normaliserIp(brut);
}

/**
 * Empreinte d'une IP pour le rate limiting : HMAC avec un secret serveur, tronqué. L'IP n'est
 * jamais stockée ni journalisée, et l'empreinte ne peut pas être inversée en énumérant les
 * adresses sans connaître le secret. Les clés qui la portent expirent en quelques heures.
 */
export function hasherIp(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(ip).digest("hex").slice(0, 32);
}
