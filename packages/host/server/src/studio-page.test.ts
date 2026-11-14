import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { StudioPage } from "./api.ts";
import { testServer } from "./test-server.ts";

// A server with no password answers loopback names only.
const loopback = "localhost";
const named = "halonic.acme.example";

const encode = (text: string) => new TextEncoder().encode(text);

/** A build with a few files, that remembers which paths the server asked for. */
class FakeBuild implements StudioPage {
  readonly asked: string[] = [];
  readonly files = new Map([
    ["studio.html", encode("<!doctype html><title>Halonic</title>")],
    ["assets/studio-1a2b.js", encode("console.log('studio');")],
    ["assets/studio-1a2b.css", encode("body{margin:0}")],
    ["notes.txt", encode("not a page file")],
    ["secret.js", encode("outside the assets")],
  ]);
  async read(path: string): Promise<Uint8Array | null> {
    this.asked.push(path);
    return this.files.get(path) ?? null;
  }
}

function ask(
  server: ReturnType<typeof testServer>,
  path: string,
  options: { host?: string; method?: string } = {},
) {
  const host = options.host ?? loopback;
  return server.handle(
    new Request(`http://${host}${path}`, { method: options.method ?? "GET", headers: { host } }),
  );
}

const pageCsp =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

describe("studio page", () => {
  verifies("server.studio-page", () => {
    it("serves the entry at / with the page's content security policy", async () => {
      const build = new FakeBuild();
      const response = await ask(testServer({ passwordHash: null, studioPage: build }), "/");
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
      expect(response.headers.get("content-security-policy")).toBe(pageCsp);
      expect(await response.text()).toContain("<title>Halonic</title>");
      expect(build.asked).toEqual(["studio.html"]);
    });

    it("keeps the other security headers on a page file", async () => {
      const server = testServer({ passwordHash: null, studioPage: new FakeBuild() });
      const response = await ask(server, "/");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("x-frame-options")).toBe("DENY");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    });

    it("serves an asset with the type of its extension", async () => {
      const server = testServer({ passwordHash: null, studioPage: new FakeBuild() });
      const script = await ask(server, "/assets/studio-1a2b.js");
      expect(script.status).toBe(200);
      expect(script.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
      expect(script.headers.get("content-security-policy")).toBe(pageCsp);
      const sheet = await ask(server, "/assets/studio-1a2b.css");
      expect(sheet.headers.get("content-type")).toBe("text/css; charset=utf-8");
    });

    it("serves the page before sign-in, while the API still needs a session", async () => {
      const server = testServer({ passwordHash: "hash", studioPage: new FakeBuild() });
      expect((await ask(server, "/", { host: named })).status).toBe(200);
      expect((await ask(server, "/api/session", { host: named })).status).toBe(401);
    });

    it("refuses a path that could leave the build, without asking the host", async () => {
      const build = new FakeBuild();
      const server = testServer({ passwordHash: null, studioPage: build });
      // The URL parser has already resolved `..` and `%2e%2e`; these are what is left to refuse.
      for (const path of [
        "/assets//studio-1a2b.js",
        "/assets/studio-1a2b.js/",
        "/assets%5Cstudio-1a2b.js",
        "/assets%2Fstudio-1a2b.js",
        "/.hidden.js",
        "/assets/.hidden.js",
      ]) {
        const response = await ask(server, path);
        expect(response.status, path).toBe(404);
      }
      expect(build.asked).toEqual([]);
    });

    it("doesn't serve a file of a kind the page isn't built from", async () => {
      const build = new FakeBuild();
      const response = await ask(
        testServer({ passwordHash: null, studioPage: build }),
        "/notes.txt",
      );
      expect(response.status).toBe(404);
      expect(build.asked).toEqual([]);
    });

    it("answers 404 for a file the build lacks, with the default policy and the usual body", async () => {
      const server = testServer({ passwordHash: null, studioPage: new FakeBuild() });
      const response = await ask(server, "/assets/missing.js");
      expect(response.status).toBe(404);
      expect(response.headers.get("content-security-policy")).toBe(
        "default-src 'none'; frame-ancestors 'none'",
      );
      expect(((await response.json()) as { code: string }).code).toBe("not_found");
    });

    it("lets an API path keep its own answer, whatever the build holds", async () => {
      const build = new FakeBuild();
      build.files.set("api/hello", encode("shadow"));
      const server = testServer({ passwordHash: null, studioPage: build });
      const hello = await ask(server, "/api/hello");
      expect(await hello.json()).toMatchObject({ product: "halonic" });
      expect((await ask(server, "/api/unknown")).status).toBe(404);
      expect(build.asked).toEqual([]);
    });

    it("answers HEAD with the headers and no body", async () => {
      const server = testServer({ passwordHash: null, studioPage: new FakeBuild() });
      const get = await ask(server, "/");
      const head = await ask(server, "/", { method: "HEAD" });
      expect(head.status).toBe(200);
      expect(head.headers.get("content-length")).toBe(get.headers.get("content-length"));
      expect(head.headers.get("content-security-policy")).toBe(pageCsp);
      expect(await head.text()).toBe("");
    });

    it("answers a write to a page path as an unknown address", async () => {
      const server = testServer({ passwordHash: null, studioPage: new FakeBuild() });
      expect((await ask(server, "/", { method: "POST" })).status).toBe(404);
    });

    it("is refused on a foreign Host by a server with no password", async () => {
      const server = testServer({ passwordHash: null, studioPage: new FakeBuild() });
      expect((await ask(server, "/", { host: "evil.example" })).status).toBe(421);
    });

    it("answers 404 with the default policy when the host gave no page", async () => {
      const response = await ask(testServer({ passwordHash: null }), "/");
      expect(response.status).toBe(404);
      expect(response.headers.get("content-security-policy")).toBe(
        "default-src 'none'; frame-ancestors 'none'",
      );
    });
  });
});
