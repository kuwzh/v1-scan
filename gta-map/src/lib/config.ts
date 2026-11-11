export const SITE = {
  name: "Leonida Map", // provisoire
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  description:
    "Carte interactive non officielle de GTA 6 : missions, collectibles, véhicules et guides en français.",
  releaseDate: "2026-11-19",
  disclaimer:
    "Site fan non officiel, non affilié à Rockstar Games ni Take-Two Interactive.",
} as const;

export const FLAGS = {
  ads: process.env.NEXT_PUBLIC_ADS_ENABLED === "true",
  affiliate: process.env.NEXT_PUBLIC_AFFILIATE_ENABLED === "true",
} as const;
