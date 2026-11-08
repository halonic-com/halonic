import type { Secrets } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { canary, client, fakeTransport, policy, redirect } from "./fake-transport.test-helper.ts";
import { createLimitedHttpClient } from "./limited-http.ts";
import { RequestLog } from "./request-log.ts";
import {
  removeSecrets,
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

async function compressed(text: string, format: "gzip" | "deflate"): Promise<Uint8Array> {
  const stream = new Response(text).body?.pipeThrough(new CompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

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

    it.each(["gzip", "deflate"] as const)(
      "decompresses a %s echo before removing the key",
      async (format) => {
        const body = await compressed(`echo: ${key}`, format);
        const { http } = client(() =>
          inPieces([body.subarray(0, 1), body.subarray(1)], {
            headers: { "content-encoding": format, "content-length": String(body.length) },
          }),
        );
        const response = await http.fetch("https://api.example.com/echo", { auth: bearer });
        expect(response.headers.has("content-encoding")).toBe(false);
        expect(response.headers.has("content-length")).toBe(false);
        expect(await response.text()).toBe(`echo: ${secretRemoved}`);
      },
    );

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

  it("doesn't decompress a body the transport already decompressed", async () => {
    const { http } = client(
      () => new Response("plain text", { headers: { "content-encoding": "gzip" } }),
    );
    const response = await http.fetch("https://api.example.com/", { auth: bearer });
    expect(response.headers.has("content-encoding")).toBe(false);
    expect(await response.text()).toBe("plain text");
  });

  it("counts the response size after decompressing", async () => {
    const bomb = await compressed("0".repeat(100_000), "gzip");
    const { http } = client(() => new Response(bomb, { headers: { "content-encoding": "gzip" } }), {
      maxResponseBytes: 1_000,
    });
    const response = await http.fetch("https://api.example.com/");
    await expect(response.text()).rejects.toMatchObject({ code: "response-too-large" });
  });

  it("passes a body without placed secrets through unchanged", async () => {
    const { http } = client(() => new Response("hello", { headers: { "content-length": "5" } }));
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
