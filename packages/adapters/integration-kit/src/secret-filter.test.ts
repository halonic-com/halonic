import type { HttpClient, Secrets } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  canary,
  client,
  fakeTransport,
  policy,
  redirect,
  secrets,
} from "./fake-transport.test-helper.ts";
import { IntegrationRefusedError } from "./integration/index.ts";
import { createLimitedHttpClient } from "./limited-http.ts";
import { RequestLog } from "./request-log.ts";
import {
  removeSecrets,
  removeSecretsFromError,
  removeSecretsStream,
  SecretRemover,
  secretForms,
  secretRemoved,
} from "./secret-filter.ts";

const key = canary["example-key"];
const bearer = { secret: "example-key", as: "bearer" } as const;
const utf8 = new TextEncoder();

/** A response whose body arrives in the given pieces. */
function inPieces(pieces: readonly (string | Uint8Array)[], init?: ResponseInit): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const piece of pieces) {
        controller.enqueue(typeof piece === "string" ? utf8.encode(piece) : piece);
      }
      controller.close();
    },
  });
  return new Response(stream, init);
}

/** A gzip file of "hello", as a `.gz` download holds it after `fetch` undid the transfer coding. */
const gzipFile = Uint8Array.from([
  0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0xcb, 0x48, 0xcd, 0xc9, 0xc9, 0x07,
  0x00, 0x86, 0xa6, 0x10, 0x36, 0x05, 0x00, 0x00, 0x00,
]);

/** A client whose `example-key` has characters every encoding changes. */
function awkwardClient(answer: (url: URL) => Response) {
  const value = 'k/ey+"v\\al ue&=~*7f3a';
  const awkward: Secrets = { get: async (name) => (name === "example-key" ? value : null) };
  const { transport } = fakeTransport(answer);
  const http = createLimitedHttpClient({
    policy,
    transport,
    secrets: awkward,
    log: new RequestLog(),
  });
  return { http, value };
}

verifies("integration-kit.secret-filter", () => {
  describe("attack case A19: a server echoes the key back", () => {
    it("removes the key and its placed form from the headers and the body", async () => {
      const { http } = client(
        () =>
          new Response(`{"seen":"Bearer ${key}","raw":"${key}"}`, {
            headers: { "x-echo-auth": `Bearer ${key}`, "x-echo-raw": key, "content-length": "99" },
          }),
      );
      const response = await http.fetch("https://api.example.com/echo", { auth: bearer });
      expect(response.headers.get("x-echo-auth")).toBe(secretRemoved);
      expect(response.headers.get("x-echo-raw")).toBe(secretRemoved);
      expect(response.headers.has("content-length")).toBe(false);
      expect(await response.text()).toBe(`{"seen":"${secretRemoved}","raw":"${secretRemoved}"}`);
    });

    it("removes the placed form field", async () => {
      const { http } = client(
        (url) =>
          new Response(`you sent: client_secret=${canary["client-secret"]}&grant=x on ${url.host}`),
      );
      const response = await http.fetch("https://oauth.example.com/token", {
        method: "POST",
        body: "grant=x",
        auth: { secret: "client-secret", as: "form", field: "client_secret" },
      });
      expect(await response.text()).toBe(`you sent: ${secretRemoved}&grant=x on oauth.example.com`);
    });

    it.each([
      ["URL-encoded", encodeURIComponent],
      ["URL-encoded in lower case", (v: string) => encodeURIComponent(v).toLowerCase()],
      ["form-encoded", (v: string) => new URLSearchParams({ v }).toString().slice(2)],
      ["JSON-escaped", (v: string) => JSON.stringify(v).slice(1, -1)],
      [
        "JSON-escaped with \\/",
        (v: string) => JSON.stringify(v).slice(1, -1).replaceAll("/", "\\/"),
      ],
    ])("removes the key %s", async (_how, encode) => {
      const { http, value } = awkwardClient(() => new Response(`before ${encode(value)} after`));
      const response = await http.fetch("https://api.example.com/echo", { auth: bearer });
      expect(await response.text()).toBe(`before ${secretRemoved} after`);
    });

    it("removes the key split across two pieces, at every byte", async () => {
      const echo = `{"auth":"Bearer ${key}"}`;
      for (let at = 1; at < echo.length; at++) {
        const { http } = client(() => inPieces([echo.slice(0, at), echo.slice(at)]));
        const response = await http.fetch("https://api.example.com/echo", { auth: bearer });
        expect(await response.text()).toBe(`{"auth":"${secretRemoved}"}`);
      }
    });

    it("removes the key after a redirect to another declared host", async () => {
      const { http, sent } = client((url) =>
        url.host === "api.example.com"
          ? redirect(302, "https://cdn.example.com/file")
          : new Response(`the first server told me ${key}`),
      );
      const response = await http.fetch("https://api.example.com/download", { auth: bearer });
      expect(await response.text()).toBe(`the first server told me ${secretRemoved}`);
      expect(sent[1]?.headers).toEqual({});
    });
  });

  describe("a server puts the key in what the kit says about the response", () => {
    it("removes the key from the status text", async () => {
      const { http } = client(() => new Response("ok", { statusText: `Bearer ${key}` }));
      const response = await http.fetch("https://api.example.com/echo", { auth: bearer });
      expect(response.statusText).toBe(secretRemoved);
    });

    it.each([
      [
        "host-not-allowed, for a redirect to a host that holds the key",
        () => redirect(302, `https://${key}.attacker.example/`),
        {},
      ],
      [
        "too-many-redirects, for a redirect loop to a path that holds the key",
        () => redirect(302, `https://api.example.com/k/${key}`),
        {},
      ],
      [
        "response-too-large, by its declared length",
        (url: URL) =>
          url.pathname === "/start"
            ? redirect(302, `https://api.example.com/k/${key}`)
            : new Response("x".repeat(20), { headers: { "content-length": "20" } }),
        { maxResponseBytes: 10 },
      ],
      [
        "response-too-large, while the body is read",
        (url: URL) =>
          url.pathname === "/start"
            ? redirect(302, `https://api.example.com/k/${key}`)
            : new Response("x".repeat(20)),
        { maxResponseBytes: 10 },
      ],
      [
        "the idle timeout, while the body is read",
        (url: URL) =>
          url.pathname === "/start"
            ? redirect(302, `https://api.example.com/k/${key}`)
            : new Response(new ReadableStream()),
        { idleTimeoutMs: 5 },
      ],
    ])(
      "never lets %s name the key: the redirect is refused first",
      async (_which, answer, limits) => {
        const { http } = client(answer, limits);
        const error = await http
          .fetch("https://api.example.com/start", { auth: bearer })
          .then((response) => response.text())
          .catch((thrown: unknown) => thrown);
        // The secret check refuses a Location that holds the key before the kit follows it.
        expect(error).toMatchObject({ code: "secret-in-redirect" });
        expect(`${String(error)} ${(error as Error).stack}`).not.toContain(key);
      },
    );

    it("never lets the headers timeout name the key: the redirect is refused first", async () => {
      const transport: HttpClient = {
        fetch: async (url, init = {}) =>
          url.endsWith("/start")
            ? redirect(302, `https://api.example.com/k/${key}`)
            : new Promise<Response>((_resolve, reject) =>
                init.signal?.addEventListener("abort", () => reject(init.signal?.reason)),
              ),
      };
      const http = createLimitedHttpClient({
        policy,
        transport,
        secrets,
        log: new RequestLog(),
        limits: { headersTimeoutMs: 5 },
      });
      const error = await http
        .fetch("https://api.example.com/start", { auth: bearer })
        .catch((thrown: unknown) => thrown);
      expect(error).toMatchObject({ code: "secret-in-redirect" });
      expect(`${String(error)} ${(error as Error).stack}`).not.toContain(key);
    });

    // Behind that check, every error leaving a request still goes through the filter.
    it("removes the key from an error's message, stack and cause, keeping its class and code", () => {
      const forms = secretForms([{ value: key, placements: [bearer] }]);
      const cause = new Error(`timed out on https://api.example.com/k/${key}`);
      const error = new IntegrationRefusedError(
        "too-many-redirects",
        `weather: api.example.com/k/${encodeURIComponent(key)} redirected too often`,
      );
      error.cause = cause;
      const filtered = removeSecretsFromError(error, forms);
      expect(filtered).toBe(error);
      expect(error.code).toBe("too-many-redirects");
      expect(error.message).toContain(secretRemoved);
      expect(`${error.message} ${error.stack} ${cause.message} ${cause.stack}`).not.toContain(key);
    });
  });

  it.each([
    ["a gzip file", "gzip", gzipFile],
    ["plain text that looks like a zlib header", "deflate", utf8.encode("80 items")],
  ])(
    "leaves %s marked with content-encoding as the transport handed it over",
    async (_what, coding, bytes) => {
      const { http } = client(
        () => new Response(bytes, { headers: { "content-encoding": coding } }),
      );
      const response = await http.fetch("https://api.example.com/", { auth: bearer });
      expect(response.headers.get("content-encoding")).toBe(coding);
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    },
  );

  it("passes the body of an integration without secrets through unchanged", async () => {
    const { transport } = fakeTransport(
      () => new Response("hello", { headers: { "content-length": "5" } }),
    );
    const http = createLimitedHttpClient({
      policy: { ...policy, secrets: {} },
      transport,
      secrets,
      log: new RequestLog(),
    });
    const response = await http.fetch("https://api.example.com/");
    expect(response.headers.get("content-length")).toBe("5");
    expect(await response.text()).toBe("hello");
  });

  describe("as plain functions for the bridge", () => {
    const forms = secretForms([{ value: key }]);

    it("removes the key from a tool result or an error message", () => {
      expect(removeSecrets(`failed with ${key} and ${encodeURIComponent(key)}`, forms)).toBe(
        `failed with ${secretRemoved} and ${secretRemoved}`,
      );
    });

    it("removes the key from stderr that arrives one byte at a time", async () => {
      const bytes = utf8.encode(`line 1\nkey=${key}\n`);
      const pieces = [...bytes].map((byte) => Uint8Array.of(byte));
      const filtered = inPieces(pieces).body?.pipeThrough(removeSecretsStream(forms));
      expect(await new Response(filtered).text()).toBe(`line 1\nkey=${secretRemoved}\n`);
    });

    it("holds back no more than the longest form less one byte", () => {
      const remover = new SecretRemover(forms);
      const passed = remover.push(utf8.encode("x".repeat(100)));
      expect(passed.length).toBe(100 - (forms.longest - 1));
      expect(remover.flush().length).toBe(forms.longest - 1);
    });

    it("matches nothing when there are no secrets", () => {
      const none = secretForms([{ value: "" }]);
      expect(none.longest).toBe(0);
      expect(new SecretRemover(none).push(utf8.encode("abc"))).toEqual(utf8.encode("abc"));
    });
  });
});
