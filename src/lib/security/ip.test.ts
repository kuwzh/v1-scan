import { describe, expect, it } from "vitest";
import { IP_INCONNUE, extraireIp, hasherIp, normaliserIp } from "./ip";

describe("normaliserIp", () => {
  it.each([
    ["203.0.113.7", "203.0.113.7"],
    [" 203.0.113.7 ", "203.0.113.7"],
    ["203.0.113.7:51234", "203.0.113.7"],
    ["::ffff:203.0.113.7", "203.0.113.7"],
    ["::ffff:cb00:7107", "203.0.113.7"],
  ])("IPv4 %s → %s", (brut, attendu) => {
    expect(normaliserIp(brut)).toBe(attendu);
  });

  it("IPv6 : on limite le préfixe /64, pas l'adresse", () => {
    const a = normaliserIp("2001:db8:abcd:12:1111:2222:3333:4444");
    const b = normaliserIp("2001:db8:abcd:12:ffff:eeee:dddd:cccc");
    expect(a).toBe(b);
    expect(a).toBe("2001:db8:abcd:12::/64");
    expect(normaliserIp("2001:db8:abcd:13::1")).not.toBe(a);
  });

  it("IPv6 abrégée, entre crochets, avec port ou zone", () => {
    expect(normaliserIp("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(normaliserIp("[2001:db8::1]:443")).toBe("2001:db8:0:0::/64");
    expect(normaliserIp("[2001:db8::1]")).toBe("2001:db8:0:0::/64");
    expect(normaliserIp("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
    expect(normaliserIp("::1")).toBe("0:0:0:0::/64");
  });

  it.each(["", "n'importe quoi", "999.1.1.1", "1.2.3", "1:2:3", "2001:::1", "gggg::1", "1::2::3"])(
    "illisible (%j) → inconnue",
    (brut) => {
      expect(normaliserIp(brut)).toBe(IP_INCONNUE);
    },
  );
});

describe("extraireIp", () => {
  const entetes = (o: Record<string, string>) => new Headers(o);

  it("préfère l'en-tête de la plateforme, que le client ne peut pas imposer", () => {
    expect(
      extraireIp(
        entetes({
          "x-vercel-forwarded-for": "198.51.100.1",
          "x-real-ip": "198.51.100.2",
          "x-forwarded-for": "6.6.6.6, 198.51.100.3",
        }),
      ),
    ).toBe("198.51.100.1");
  });

  it("à défaut, x-real-ip puis le premier de x-forwarded-for", () => {
    expect(extraireIp(entetes({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(extraireIp(entetes({ "x-forwarded-for": "198.51.100.3, 10.0.0.1" }))).toBe(
      "198.51.100.3",
    );
  });

  it("sans en-tête, tout le monde partage l'identité « inconnue »", () => {
    expect(extraireIp(entetes({}))).toBe(IP_INCONNUE);
  });
});

describe("hasherIp", () => {
  it("est stable, dépend du secret et ne contient pas l'adresse", () => {
    const h = hasherIp("203.0.113.7", "secret-1");
    expect(hasherIp("203.0.113.7", "secret-1")).toBe(h);
    expect(hasherIp("203.0.113.7", "secret-2")).not.toBe(h);
    expect(hasherIp("203.0.113.8", "secret-1")).not.toBe(h);
    expect(h).toMatch(/^[0-9a-f]{32}$/);
    expect(h).not.toContain("203");
  });
});
