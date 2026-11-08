import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { canary, client, redirect, refusal } from "./fake-transport.test-helper.ts";

const key = canary["example-key"];
const bearer = { secret: "example-key", as: "bearer" } as const;

verifies("integration-kit.secret-in-request", () => {
  describe("attack case A25: the integration carries a key out", () => {
    it.each([
      ["in the query", `https://api.example.com/v1?k=${key}`, {}],
      [
        "URL-encoded in the query",
        `https://api.example.com/v1?k=${encodeURIComponent(`${key}/`)}`,
        {},
      ],
      ["percent-encoded in part", `https://api.example.com/v1?k=${key.replace("-", "%2D")}`, {}],
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
    ])("refuses the key %s, sends nothing and never shows it", async (_where, url, init) => {
      const { http, sent, log } = client();
      const error = await http.fetch(url, init).catch((thrown: unknown) => thrown);
      expect(error).toMatchObject({ code: "secret-in-request" });
      expect(sent).toEqual([]);
      for (const shown of [String(error), JSON.stringify(log.entries())]) {
        expect(shown.toLowerCase()).not.toContain(key.toLowerCase());
      }
      expect(log.entries()[0]).toMatchObject({ outcome: "refused", refusal: "secret-in-request" });
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
  });

  it("still sends a clean request with a key the kit places", async () => {
    const { http, sent } = client();
    await http.fetch("https://api.example.com/v1?city=Ghent", { auth: bearer });
    expect(sent[0]?.headers["authorization"]).toBe(`Bearer ${key}`);
  });

  it("removes a secret the request didn't place from the response", async () => {
    const { http } = client(() => new Response(`other: ${canary["client-secret"]}`));
    const response = await http.fetch("https://api.example.com/", { auth: bearer });
    expect(await response.text()).toBe("other: [secret removed]");
  });
});
