import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { NoProxy } from "./no-proxy.ts";
import { type ProxyFromEnv, proxyFromEnv } from "./proxy-from-env.ts";

function proxyOf(setting: ProxyFromEnv) {
  if (setting.kind !== "proxy") {
    throw new Error(`expected a proxy, got ${setting.kind}`);
  }
  return setting.proxy;
}

/** A proxy URL with credentials, built here so no literal one sits in the source. */
function proxyUrl(scheme: string, username: string, password: string, rest: string): string {
  return `${scheme}://${[username, password].join(":")}${String.fromCharCode(64)}${rest}`;
}

function refusalOf(setting: ProxyFromEnv): string {
  if (setting.kind !== "refused") {
    throw new Error(`expected a refusal, got ${setting.kind}`);
  }
  return setting.message;
}

verifies("http-node.proxy-config", () => {
  describe("reading the environment", () => {
    it("returns none when no proxy is set", () => {
      expect(proxyFromEnv({})).toEqual({ kind: "none" });
      expect(proxyFromEnv({ HTTP_PROXY: "http://proxy.corp:3128" })).toEqual({ kind: "none" });
    });

    it("reads the lower-case name before the upper-case one", () => {
      const proxy = proxyOf(
        proxyFromEnv({ https_proxy: "http://lower:1", HTTPS_PROXY: "http://upper:2" }),
      );
      expect(proxy.endpoint.toString()).toBe("http://lower:1");
    });

    it("treats an empty lower-case value as not set and falls through (C1)", () => {
      const proxy = proxyOf(
        proxyFromEnv({ https_proxy: "", HTTPS_PROXY: "http://proxy.corp:3128" }),
      );
      expect(proxy.endpoint.toString()).toBe("http://proxy.corp:3128");
      expect(proxyFromEnv({ https_proxy: "  ", HTTPS_PROXY: "" })).toEqual({ kind: "none" });
    });

    it("uses port 80 when the URL has none and prints IPv6 in brackets", () => {
      expect(proxyOf(proxyFromEnv({ HTTPS_PROXY: "http://Proxy.Corp" })).endpoint.toString()).toBe(
        "http://proxy.corp:80",
      );
      expect(proxyOf(proxyFromEnv({ HTTPS_PROXY: "http://[::1]:3128" })).endpoint.toString()).toBe(
        "http://[::1]:3128",
      );
    });

    it("refuses a value without a scheme as not a URL, naming nothing from it", () => {
      const message = refusalOf(proxyFromEnv({ HTTPS_PROXY: "proxy.corp:3128" }));
      expect(message).toContain("not a URL");
      expect(message).not.toContain("proxy.corp");
    });

    it.each([
      ["socks5://proxy.corp:1080", "socks5"],
      ["https://proxy.corp:3129", "https"],
    ])("refuses %s and names the scheme", (value, shown) => {
      const setting = proxyFromEnv({ HTTPS_PROXY: value });
      expect(refusalOf(setting)).toContain(shown);
      // As a fact too, for `halonic doctor`'s Network line (HAL-14262).
      expect(setting).toMatchObject({ kind: "refused", variable: "HTTPS_PROXY", scheme: shown });
    });

    it.each([
      "http://",
      "not a url",
      "http://proxy.corp:3128/path",
      "http://proxy.corp:3128/?x=1",
      "http://proxy.corp:0",
      proxyUrl("http", "user", "%zz", "proxy.corp:3128"),
    ])("refuses the malformed value %s", (value) => {
      expect(proxyFromEnv({ HTTPS_PROXY: value }).kind).toBe("refused");
    });
  });

  describe("the user name and password", () => {
    const setting = proxyFromEnv({
      HTTPS_PROXY: proxyUrl("http", "us%40er", "p%3Aa%25ss", "proxy.corp:3128"),
    });

    it("are decoded into the Proxy-Authorization value", () => {
      const header = proxyOf(setting).endpoint.proxyAuthorization();
      expect(Buffer.from((header ?? "").replace("Basic ", ""), "base64").toString()).toBe(
        "us@er:p:a%ss",
      );
    });

    it("never show in printing, JSON or a refusal message", () => {
      const endpoint = proxyOf(setting).endpoint;
      for (const shown of [String(endpoint), JSON.stringify(endpoint), JSON.stringify(setting)]) {
        expect(shown).not.toMatch(/user|p%3Aa|p:a|ss@/);
      }
      for (const value of [
        proxyUrl("socks5", "bob", "hunter2", "proxy.corp:1080"),
        proxyUrl("http", "bob", "hunter2%zz", "proxy.corp:1"),
        proxyUrl("http", "bob", "hunter2", "proxy.corp:1/path"),
        "bob:hunter2@proxy.corp:3128", // no scheme: `bob:` reads as one
      ]) {
        expect(refusalOf(proxyFromEnv({ HTTPS_PROXY: value }))).not.toMatch(/bob|hunter2/);
      }
    });

    it("are absent when the URL has none", () => {
      const proxy = proxyOf(proxyFromEnv({ HTTPS_PROXY: "http://proxy.corp:3128" }));
      expect(proxy.endpoint.proxyAuthorization()).toBeUndefined();
    });
  });

  describe("NO_PROXY", () => {
    const matches = (list: string | undefined, url: string) =>
      NoProxy.parse(list).matches(new URL(url));

    it("reads no_proxy before NO_PROXY", () => {
      const env = { HTTPS_PROXY: "http://p:1", no_proxy: "a.test", NO_PROXY: "b.test" };
      const { noProxy } = proxyOf(proxyFromEnv(env));
      expect(noProxy.matches(new URL("https://a.test/"))).toBe(true);
      expect(noProxy.matches(new URL("https://b.test/"))).toBe(false);
    });

    it("matches nothing when empty or unset", () => {
      expect(matches(undefined, "https://example.com/")).toBe(false);
      expect(matches(" , ,", "https://example.com/")).toBe(false);
    });

    it("matches everything for *", () => {
      expect(matches("*", "https://example.com/")).toBe(true);
    });

    it("matches a name and its subdomains, with or without a leading dot, in any case", () => {
      for (const list of ["example.com", ".example.com", "*.example.com", "EXAMPLE.com"]) {
        expect(matches(list, "https://example.com/")).toBe(true);
        expect(matches(list, "https://API.Example.com/")).toBe(true);
        expect(matches(list, "https://badexample.com/")).toBe(false);
        expect(matches(list, "https://example.com.evil.test/")).toBe(false);
      }
    });

    it("narrows an entry by port, using the scheme's default port", () => {
      expect(matches("example.com:8443", "https://example.com:8443/")).toBe(true);
      expect(matches("example.com:8443", "https://example.com/")).toBe(false);
      expect(matches("example.com:443", "https://example.com/")).toBe(true);
      expect(matches("example.com:80", "http://example.com/")).toBe(true);
    });

    it("matches an IP literal exactly, IPv6 in any spelling", () => {
      expect(matches("10.0.0.1", "https://10.0.0.1/")).toBe(true);
      expect(matches("10.0.0.1", "https://10.0.0.10/")).toBe(false);
      expect(matches("10.0.0.1:8443", "https://10.0.0.1:8443/")).toBe(true);
      expect(matches("10.0.0.1:8443", "https://10.0.0.1/")).toBe(false);
      expect(matches("::1", "https://[::1]/")).toBe(true);
      expect(matches("[::1]:8443", "https://[0:0:0:0:0:0:0:1]:8443/")).toBe(true);
      expect(matches("[::1]:8443", "https://[::1]/")).toBe(false);
    });

    it("has no ranges: a CIDR entry matches nothing", () => {
      expect(matches("10.0.0.0/8", "https://10.1.2.3/")).toBe(false);
      expect(matches("10.0.0.0/8", "https://10.0.0.0/")).toBe(false);
    });

    it("drops entries it can't understand, so their hosts go through the proxy", () => {
      expect(matches("example.com:notaport,[::zz]", "https://example.com/")).toBe(false);
      expect(matches("example.com:99999", "https://example.com/")).toBe(false);
    });

    it("ignores a trailing dot on the host", () => {
      expect(matches("example.com", "https://example.com./")).toBe(true);
    });
  });
});
