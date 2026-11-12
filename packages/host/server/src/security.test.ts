import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { testServer } from "./test-server.ts";

const withPassword = () => testServer({ passwordHash: "hash" });
const withoutPassword = () => testServer({ passwordHash: null });

function request(url: string, headers: Record<string, string>, init: RequestInit = {}): Request {
  return new Request(url, { ...init, headers });
}

describe("host check", () => {
  verifies("server.host-check", () => {
    it("accepts a loopback name on any port, with or without a password", async () => {
      for (const server of [withPassword(), withoutPassword()]) {
        for (const host of ["localhost:4173", "127.0.0.1:80", "[::1]:3000", "LOCALHOST"]) {
          const response = await server.handle(request("http://localhost/x", { host }));
          expect(response.status, host).toBe(404);
        }
      }
    });

    it("refuses a rebinding name when no password is set, even one the host lists", async () => {
      const server = testServer({ passwordHash: null, config: { allowedHosts: ["evil.example"] } });
      const response = await server.handle(
        request("http://evil.example/x", { host: "evil.example" }),
      );
      expect(response.status).toBe(421);
      expect(await response.json()).toEqual({
        code: "host_not_allowed",
        message: "This server doesn't answer to that host name.",
      });
    });

    it("accepts a listed name when a password is set, and refuses an unlisted one", async () => {
      const server = withPassword();
      const listed = await server.handle(request("http://x/x", { host: "halonic.acme.example" }));
      const unlisted = await server.handle(request("http://x/x", { host: "evil.example" }));
      expect([listed.status, unlisted.status]).toEqual([404, 421]);
    });

    it("refuses a missing Host and a Host with user info, a path or a space", async () => {
      const server = withPassword();
      for (const host of [
        "",
        "a@halonic.acme.example",
        "halonic.acme.example/x",
        "halonic acme",
        "localhost.",
        "localhost:99999x",
      ]) {
        const response = await server.handle(request("http://x/x", host === "" ? {} : { host }));
        expect(response.status, host).toBe(421);
      }
    });
  });
});

describe("origin check", () => {
  verifies("server.origin-check", () => {
    const host = "halonic.acme.example";

    it("accepts a request with no Origin and one with this server's own origin", async () => {
      const server = withPassword();
      const none = await server.handle(request("https://halonic.acme.example/x", { host }));
      const own = await server.handle(
        request("https://halonic.acme.example/x", { host, origin: "https://halonic.acme.example" }),
      );
      expect([none.status, own.status]).toEqual([404, 404]);
    });

    it("refuses another origin, a different scheme, a different port and null", async () => {
      const server = withPassword();
      for (const origin of [
        "https://evil.example",
        "http://halonic.acme.example",
        "https://halonic.acme.example:8443",
        "null",
      ]) {
        const response = await server.handle(
          request("https://halonic.acme.example/x", { host, origin }),
        );
        expect(response.status, origin).toBe(403);
        expect(((await response.json()) as { code: string }).code).toBe("origin_not_allowed");
      }
    });

    it("refuses a page on a loopback server that is not the server's own origin", async () => {
      const response = await withoutPassword().handle(
        request("http://localhost:4173/x", {
          host: "localhost:4173",
          origin: "http://localhost:3000",
        }),
      );
      expect(response.status).toBe(403);
    });
  });
});

describe("response headers", () => {
  verifies("server.response-headers", () => {
    it("puts the strict headers on a success and on every refusal", async () => {
      const server = withPassword();
      const responses = [
        await server.handle(request("http://x/x", { host: "halonic.acme.example" })),
        await server.handle(request("http://x/x", { host: "evil.example" })),
        await server.handle(
          request("http://x/x", { host: "halonic.acme.example", origin: "http://evil.example" }),
        ),
      ];
      for (const response of responses) {
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        expect(response.headers.get("x-frame-options")).toBe("DENY");
        expect(response.headers.get("referrer-policy")).toBe("no-referrer");
        expect(response.headers.get("content-security-policy")).toBe(
          "default-src 'none'; frame-ancestors 'none'",
        );
        expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
      }
    });

    it("adds Strict-Transport-Security on https only", async () => {
      const server = withPassword();
      const secure = await server.handle(
        request("https://halonic.acme.example/x", { host: "halonic.acme.example" }),
      );
      const plain = await server.handle(request("http://localhost/x", { host: "localhost" }));
      expect(secure.headers.get("strict-transport-security")).toBe("max-age=31536000");
      expect(plain.headers.get("strict-transport-security")).toBeNull();
    });
  });
});

describe("body limit", () => {
  verifies("server.body-limit", () => {
    const host = "halonic.acme.example";

    it("refuses a body whose Content-Length is over the limit before reading it", async () => {
      let read = false;
      const body = new ReadableStream<Uint8Array>(
        {
          pull() {
            read = true;
          },
        },
        { highWaterMark: 0 },
      );
      const response = await withPassword().handle(
        request("http://x/x", { host, "content-length": "2048" }, {
          method: "POST",
          body,
          duplex: "half",
        } as RequestInit),
      );
      expect(response.status).toBe(413);
      expect(read).toBe(false);
    });

    it("stops a chunked body with no Content-Length at the limit and cancels the stream", async () => {
      let sent = 0;
      let cancelled = false;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          sent += 512;
          controller.enqueue(new Uint8Array(512));
        },
        cancel() {
          cancelled = true;
        },
      });
      const response = await withPassword().handle(
        request("http://x/x", { host }, { method: "POST", body, duplex: "half" } as RequestInit),
      );
      expect(response.status).toBe(413);
      expect(cancelled).toBe(true);
      expect(sent).toBeLessThan(4096);
    });

    it("stops a body that lies about a small Content-Length", async () => {
      const response = await withPassword().handle(
        request(
          "http://x/x",
          { host, "content-length": "10" },
          { method: "POST", body: new Uint8Array(2000) },
        ),
      );
      expect(response.status).toBe(413);
    });

    it("lets a body at the limit through", async () => {
      const response = await withPassword().handle(
        request("http://x/x", { host }, { method: "POST", body: new Uint8Array(1024) }),
      );
      expect(response.status).toBe(404);
    });
  });
});

describe("error body", () => {
  verifies("server.error-body", () => {
    it("answers an unexpected failure with a code and a short message, never the cause", async () => {
      const broken = testServer({
        passwordHash: null,
        secrets: {
          get: async () => {
            throw new Error("disk /srv/secret-path failed");
          },
        },
      });
      const response = await broken.handle(request("http://x/x", { host: "localhost" }));
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        code: "internal_error",
        message: "The server couldn't answer this request.",
      });
    });

    it("throws a RangeError for an unusable config", () => {
      for (const config of [
        { allowedHosts: [] },
        { dailyRequests: 0 },
        { dailyRequests: 1.5 },
        { maxBodyBytes: 0 },
      ]) {
        expect(() => testServer({ passwordHash: null, config })).toThrow(RangeError);
      }
    });
  });
});
