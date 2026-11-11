import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { registrableDomain } from "./registrable-domain.ts";
import { siteName, siteNameMaxLength } from "./site-name.ts";

/** The name as one text, the way a screen shows it. */
function shown(host: string): string {
  const name = siteName(host);
  return name.prefix + name.domain;
}

verifies("std.site-name", () => {
  describe("the parts", () => {
    it("splits a name into its prefix and its registrable domain", () => {
      expect(siteName("registry.npmjs.org")).toEqual({
        prefix: "registry.",
        domain: "npmjs.org",
        cut: false,
      });
    });

    it("lowercases a name and drops its trailing dot", () => {
      expect(siteName("REGISTRY.npmjs.org.")).toEqual(siteName("registry.npmjs.org"));
    });

    it("shows a name that is its own domain with no prefix", () => {
      expect(siteName("npmjs.org")).toEqual({ prefix: "", domain: "npmjs.org", cut: false });
      expect(siteName("localhost")).toEqual({ prefix: "", domain: "localhost", cut: false });
    });

    it("shows an IP address whole, as the domain", () => {
      expect(siteName("10.0.0.1")).toEqual({ prefix: "", domain: "10.0.0.1", cut: false });
      expect(siteName("2001:db8::1")).toEqual({ prefix: "", domain: "2001:db8::1", cut: false });
      expect(siteName("[2001:db8::1]")).toEqual({
        prefix: "",
        domain: "[2001:db8::1]",
        cut: false,
      });
    });
  });

  describe("look-alikes", () => {
    it("shows the real domain of a name that starts like a known one", () => {
      expect(siteName("registry.npmjs.org.evil.example")).toEqual({
        prefix: "registry.npmjs.org.",
        domain: "evil.example",
        cut: false,
      });
    });

    it("takes the domain after a two-label public suffix", () => {
      expect(siteName("npmjs.org.co.uk").domain).toBe("org.co.uk");
    });

    it("knows the suffixes of the list's private section", () => {
      expect(siteName("my.site.github.io").domain).toBe("site.github.io");
      expect(siteName("github.io")).toEqual({ prefix: "", domain: "github.io", cut: false });
    });

    it("escapes a Cyrillic letter that looks Latin", () => {
      expect(shown("registry.npmjs.org")).not.toBe(shown("registry.npmj\u0455.org"));
      expect(siteName("registry.npmj\u0455.org").domain).toBe("npmj\\u{455}.org");
      expect(siteName("\u0430pi.npmjs.org").prefix).toBe("\\u{430}pi.");
    });

    it("escapes a right-to-left override", () => {
      expect(shown("evil.example\u202egro.smjpn")).toBe("evil.example\\u{202e}gro.smjpn");
    });

    it("escapes a full-width dot, which doesn't separate labels", () => {
      expect(siteName("api.npmjs\uff0eorg.evil.example")).toEqual({
        prefix: "api.npmjs\\u{ff0e}org.",
        domain: "evil.example",
        cut: false,
      });
    });

    it("finds a public suffix written in Unicode, and keeps it escaped", () => {
      expect(siteName("foo.evil.\u516c\u53f8.cn")).toEqual({
        prefix: "foo.",
        domain: "evil.\\u{516c}\\u{53f8}.cn",
        cut: false,
      });
    });

    it("lowercases only A to Z, so the Kelvin sign stays escaped", () => {
      expect(siteName("\u212Aorse.com").domain).toBe("\\u{212a}orse.com");
    });

    it("shows a Punycode name as it is, never decoded", () => {
      expect(siteName("xn--bcher-kva.example")).toEqual({
        prefix: "",
        domain: "xn--bcher-kva.example",
        cut: false,
      });
    });

    it("writes any character outside the plain set as an escape", () => {
      expect(shown("a_b c.example")).toBe("a\\u{5f}b\\u{20}c.example");
    });
  });

  describe("the length cap", () => {
    it("is 64 characters", () => {
      expect(siteNameMaxLength).toBe(64);
    });

    it("leaves a name of exactly 64 characters whole", () => {
      const host = `${"a".repeat(51)}.evil.example`;
      expect(host).toHaveLength(64);
      expect(siteName(host)).toMatchObject({ prefix: `${"a".repeat(51)}.`, cut: false });
    });

    it("cuts the middle of a long prefix and keeps the domain whole", () => {
      const name = siteName(`x7f3${"0".repeat(192)}a91c.evil.example`);
      expect(name).toEqual({
        prefix: `x7f3${"0".repeat(21)}…${"0".repeat(21)}a91c.`,
        domain: "evil.example",
        cut: true,
      });
      expect(name.prefix.length + name.domain.length).toBe(siteNameMaxLength);
    });

    it("counts the characters after escaping, and never splits an escape", () => {
      const name = siteName(`${"\u0430".repeat(40)}.evil.example`);
      expect(name.cut).toBe(true);
      expect(name.prefix.length + name.domain.length).toBeLessThanOrEqual(siteNameMaxLength);
      expect(name.prefix).toMatch(/^(?:\\u\{430\})+…(?:\\u\{430\})*\.$/);
    });

    it("keeps a domain of exactly 64 characters whole, without its prefix", () => {
      const domain = `${"z".repeat(60)}.com`;
      expect(siteName(`api.${domain}`)).toEqual({ prefix: "", domain, cut: true });
    });

    it("keeps only a … of the prefix next to a domain of 63 characters", () => {
      const domain = `${"z".repeat(59)}.com`;
      expect(siteName(`api.${domain}`)).toEqual({ prefix: "…", domain, cut: true });
    });

    it("cuts the start of a domain too long by itself", () => {
      const label = "y".repeat(63);
      const name = siteName(`api.${label}.com`);
      expect(name).toEqual({ prefix: "", domain: `…${"y".repeat(59)}.com`, cut: true });
      expect(name.domain).toHaveLength(siteNameMaxLength);
    });
  });
});

describe("registrableDomain", () => {
  // Cases from the list's own test file (tests/test_psl.txt), in ASCII form.
  it.each([
    ["com", "com"],
    ["example.com", "example.com"],
    ["b.example.com", "example.com"],
    ["a.b.example.com", "example.com"],
    ["uk.com", "uk.com"],
    ["example.uk.com", "example.uk.com"],
    ["b.example.uk.com", "example.uk.com"],
    ["test.ac", "test.ac"],
    ["c.mm", "c.mm"],
    ["b.c.mm", "b.c.mm"],
    ["a.b.c.mm", "b.c.mm"],
    ["test.jp", "test.jp"],
    ["www.test.jp", "test.jp"],
    ["test.kyoto.jp", "test.kyoto.jp"],
    ["ide.kyoto.jp", "ide.kyoto.jp"],
    ["b.ide.kyoto.jp", "b.ide.kyoto.jp"],
    ["c.kobe.jp", "c.kobe.jp"],
    ["b.c.kobe.jp", "b.c.kobe.jp"],
    ["city.kobe.jp", "city.kobe.jp"],
    ["www.city.kobe.jp", "city.kobe.jp"],
    ["www.ck", "www.ck"],
    ["www.www.ck", "www.ck"],
    ["test.ck", "test.ck"],
    ["b.test.ck", "b.test.ck"],
    ["us", "us"],
    ["test.us", "test.us"],
    ["www.test.us", "test.us"],
    ["ak.us", "ak.us"],
    ["www.test.ak.us", "test.ak.us"],
    ["k12.ak.us", "k12.ak.us"],
    ["www.test.k12.ak.us", "test.k12.ak.us"],
    ["xn--85x722f.com.cn", "xn--85x722f.com.cn"],
    ["www.xn--85x722f.xn--55qx5d.cn", "xn--85x722f.xn--55qx5d.cn"],
    ["xn--55qx5d.cn", "xn--55qx5d.cn"],
    ["shishi.xn--fiqs8s", "shishi.xn--fiqs8s"],
    ["www.example.unknowntld", "example.unknowntld"],
  ])("finds %s's registrable domain: %s", (host, domain) => {
    expect(registrableDomain(host)).toBe(domain);
  });
});
