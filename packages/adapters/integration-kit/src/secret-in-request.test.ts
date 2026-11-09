import type { IntegrationRequestInit, Secrets } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  canary,
  client,
  fakeTransport,
  policy,
  redirect,
  refusal,
  secrets,
} from "./fake-transport.test-helper.ts";
import { createLimitedHttpClient } from "./limited-http.ts";
import type { Body } from "./request-body.ts";
import { RequestLog } from "./request-log.ts";

const key = canary["example-key"];
const bearer = { secret: "example-key", as: "bearer" } as const;

/**
 * An all-upper-case key: the canaries are lower case, and the kit sends the method uppercased.
 * Derived from the canary so the secret scan sees no new key-shaped literal.
 */
const upperKey = key.toUpperCase();
const upperSecrets: Secrets = {
  get: async (name) => (name === "example-key" ? upperKey : null),
};

verifies("integration-kit.secret-in-request", () => {
  describe("attack case A25: the integration carries a key out", () => {
    it.each<[where: string, url: string, init: IntegrationRequestInit, store?: Secrets]>([
      ["in the query", `https://api.example.com/v1?k=${key}`, {}],
      [
        "URL-encoded in the query",
        `https://api.example.com/v1?k=${encodeURIComponent(`${key}/`)}`,
        {},
      ],
      ["percent-encoded in part", `https://api.example.com/v1?k=${key.replace("-", "%2D")}`, {}],
      [
        "percent-encoded in part, next to a malformed escape",
        `https://api.example.com/v1?k=${key.replace("-", "%2D")}&x=%ZZ`,
        {},
      ],
      [
        "percent-encoded in part, in a run that isn't valid UTF-8",
        `https://api.example.com/v1?k=${key.slice(0, -1)}%${key.charCodeAt(key.length - 1).toString(16)}%FF`,
        {},
      ],
      ["in the path", `https://api.example.com/${key}`, {}],
      ["in the host", `https://${key}.example.net/`, {}],
      ["in a header of its own", "https://api.example.com/", { headers: { "x-note": key } }],
      [
        "in its own authorization header",
        "https://api.example.com/",
        { headers: { authorization: `Bearer ${key}` } },
      ],
      ["in a text body", "https://api.example.com/", { method: "POST", body: `{"k":"${key}"}` }],
      [
        "percent-encoded in part in a form string body",
        "https://api.example.com/",
        { method: "POST", body: `k=${key.replace("-", "%2D")}&x=%ZZ` },
      ],
      [
        "in a form body",
        "https://api.example.com/",
        { method: "POST", body: new URLSearchParams({ k: key }) },
      ],
      [
        "in a byte body",
        "https://api.example.com/",
        { method: "POST", body: new TextEncoder().encode(`xx${key}xx`) },
      ],
      ["in the method", "https://api.example.com/", { method: `X${key}` }],
      [
        "in the method, in lower case, that the kit sends uppercased",
        "https://api.example.com/",
        { method: upperKey.toLowerCase() },
        upperSecrets,
      ],
      [
        "in the host and path, with a body the kit refuses",
        `https://${key}.example.net/${key}`,
        { method: `X${key}`, body: new Blob(["x"]) },
      ],
    ])("refuses the key %s, sends nothing and never shows it", async (_where, url, init, store) => {
      const { http, sent, log } = client(undefined, undefined, policy, store ?? secrets);
      const error = await http.fetch(url, init).catch((thrown: unknown) => thrown);
      expect(error).toMatchObject({ code: "secret-in-request" });
      expect(sent).toEqual([]);
      const value = store === upperSecrets ? upperKey : key;
      for (const shown of [String(error), JSON.stringify(log.entries())]) {
        expect(shown.toLowerCase()).not.toContain(value.toLowerCase());
      }
      expect(log.entries()[0]).toMatchObject({ outcome: "refused", refusal: "secret-in-request" });
    });

    it("logs nothing of the request when reading the secrets fails", async () => {
      const log = new RequestLog();
      const http = createLimitedHttpClient({
        policy,
        transport: fakeTransport().transport,
        secrets: { get: async () => Promise.reject(new Error("store offline")) },
        log,
      });
      await expect(http.fetch(`https://${key}.example.net/${key}`)).rejects.toThrow(
        "store offline",
      );
      expect(log.entries()[0]).toMatchObject({ method: "", host: "", path: "", outcome: "failed" });
    });

    it.each([
      ["a declared host the secret isn't for", "https://cdn.example.com/"],
      ["the host the secret is declared for", "https://api.example.com/"],
    ])("refuses it to %s", async (_which, host) => {
      const { http, sent } = client();
      expect(await refusal(http.fetch(`${host}?k=${key}`))).toBe("secret-in-request");
      expect(sent).toEqual([]);
    });

    it("refuses a secret this request doesn't place", async () => {
      const { http, sent } = client();
      const carried = http.fetch("https://api.example.com/", {
        auth: bearer,
        headers: { "x-other": canary["client-secret"] },
      });
      expect(await refusal(carried)).toBe("secret-in-request");
      expect(sent).toEqual([]);
    });

    it("refuses a redirect whose Location holds the key", async () => {
      const { http, sent } = client((url) =>
        url.host === "api.example.com"
          ? redirect(302, `https://cdn.example.com/collect?k=${key}`)
          : new Response("collected"),
      );
      const error = await http
        .fetch("https://api.example.com/start", { auth: bearer })
        .catch((thrown: unknown) => thrown);
      expect(error).toMatchObject({ code: "secret-in-request" });
      expect(String(error)).not.toContain(key);
      expect(sent).toHaveLength(1);
    });

    describe("the code changes its request after the check", () => {
      /** Request options whose `name` gives `first` on the first read and `later` after it. */
      function changing(name: string, first: unknown, later: unknown, init: object = {}) {
        let reads = 0;
        const changed = Object.defineProperty({ ...init }, name, {
          enumerable: true,
          get: () => (++reads === 1 ? first : later),
        });
        return { init: changed, reads: () => reads };
      }

      it.each([
        ["headers", {}, { "x-note": key }],
        ["body", "clean", `{"k":"${key}"}`],
        ["method", "POST", `X${key}`],
      ])(
        "reads a getter on %s once, so the check and the transport see the same value",
        async (name, first, later) => {
          const { http, sent } = client();
          const given = changing(name, first, later, { method: "POST" });
          await http.fetch("https://api.example.com/", given.init);
          expect(given.reads()).toBe(1);
          expect(sent).toHaveLength(1);
          expect(JSON.stringify(sent)).not.toContain(key);
        },
      );

      it("never turns a URL that isn't plain text into text, so the log can't get a key", async () => {
        const { http, sent, log } = client();
        let reads = 0;
        const url = {
          toString: () =>
            ++reads === 1 ? "https://api.example.com/" : `https://api.example.com/${key}`,
        };
        expect(await refusal(http.fetch(url as unknown as string))).toBe("bad-url");
        expect(reads).toBe(0);
        expect(sent).toEqual([]);
        expect(JSON.stringify(log.entries())).not.toContain(key);
      });

      it("sends the headers it checked when the code changes its Headers object after fetch", async () => {
        const { http, sent } = client();
        const headers = new Headers({ "x-note": "clean" });
        const pending = http.fetch("https://api.example.com/", { headers });
        headers.set("x-note", key);
        await pending;
        expect(sent[0]?.headers["x-note"]).toBe("clean");
      });

      it.each([
        ["a byte array", (bytes: Uint8Array<ArrayBuffer>): Body => bytes],
        ["an ArrayBuffer", (bytes: Uint8Array<ArrayBuffer>): Body => bytes.buffer],
      ])("sends the bytes it checked when the code changes %s after fetch", async (_kind, give) => {
        const { http, sent } = client();
        const bytes = new TextEncoder().encode("x".repeat(key.length));
        const pending = http.fetch("https://api.example.com/", {
          method: "POST",
          body: give(bytes),
        });
        bytes.set(new TextEncoder().encode(key));
        await pending;
        expect(sent[0]?.body).toBe("x".repeat(key.length));
      });

      it("sends the form it checked when the code changes its form after fetch", async () => {
        const { http, sent } = client();
        const form = new URLSearchParams({ note: "clean" });
        const pending = http.fetch("https://api.example.com/", { method: "POST", body: form });
        form.set("note", key);
        await pending;
        expect(sent[0]?.body).toBe("note=clean");
      });
    });
  });

  it("still sends a clean request with a key the kit places", async () => {
    const { http, sent } = client();
    await http.fetch("https://api.example.com/v1?city=Ghent", { auth: bearer });
    expect(sent[0]?.headers["authorization"]).toBe(`Bearer ${key}`);
  });

  it("drops a referrer, which would go out as an unchecked Referer header", async () => {
    const { http, sent, options } = client();
    await http.fetch("https://api.example.com/v1", {
      auth: bearer,
      referrer: `https://api.example.com/${key}`,
    });
    expect(options[0]).not.toHaveProperty("referrer");
    expect(JSON.stringify(sent)).not.toContain(`/${key}`);
  });

  it("removes a secret the request didn't place from the response", async () => {
    const { http } = client(() => new Response(`other: ${canary["client-secret"]}`));
    const response = await http.fetch("https://api.example.com/", { auth: bearer });
    expect(await response.text()).toBe("other: [secret removed]");
  });
});
