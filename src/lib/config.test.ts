import { describe, expect, it } from "vitest";
import { APP_NAME, getSiteUrl } from "./config";

describe("getSiteUrl", () => {
  it("retombe sur localhost quand la variable est absente ou vide", () => {
    expect(getSiteUrl({})).toBe("http://localhost:3000");
    expect(getSiteUrl({ NEXT_PUBLIC_SITE_URL: "  " })).toBe("http://localhost:3000");
  });

  it("retire le slash final et le chemin", () => {
    expect(getSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://gardo.app/" })).toBe("https://gardo.app");
    expect(getSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://gardo.app/x?y=1" })).toBe(
      "https://gardo.app",
    );
  });

  it("rejette une URL invalide ou un protocole inattendu", () => {
    expect(getSiteUrl({ NEXT_PUBLIC_SITE_URL: "pas une url" })).toBe("http://localhost:3000");
    expect(getSiteUrl({ NEXT_PUBLIC_SITE_URL: "javascript:alert(1)" })).toBe(
      "http://localhost:3000",
    );
  });
});

describe("APP_NAME", () => {
  it("est défini", () => {
    expect(APP_NAME.length).toBeGreaterThan(0);
  });
});
