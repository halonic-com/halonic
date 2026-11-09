import type { IntegrationRequestInit } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { canary, client, refusal } from "./fake-transport.test-helper.ts";
import { maxRequestBodyBytes } from "./request-body.ts";

const atLimit = maxRequestBodyBytes;

function post(body: unknown, auth?: IntegrationRequestInit["auth"]): IntegrationRequestInit {
  return {
    method: "POST",
    body: body as NonNullable<IntegrationRequestInit["body"]>,
    ...(auth ? { auth } : {}),
  };
}

/** A form whose encoded size is exactly `bytes`. */
function formOf(bytes: number): URLSearchParams {
  return new URLSearchParams({ q: "x".repeat(bytes - "q=".length) });
}

/** The number of bytes the fake transport received, as UTF-8. */
function sentBytes(body: string | null | undefined): number {
  return new TextEncoder().encode(body ?? "").byteLength;
}

verifies("integration-kit.request-body-limit", () => {
  it("exports the limit as 720 KiB", () => {
    expect(maxRequestBodyBytes).toBe(737_280);
  });

  it.each([
    ["text", (bytes: number) => "x".repeat(bytes)],
    ["bytes", (bytes: number) => new Uint8Array(bytes)],
    ["a form", formOf],
  ])("sends %s of exactly the limit unchanged", async (_what, make) => {
    const { http, sent } = client();
    await http.fetch("https://api.example.com/upload", post(make(atLimit)));
    expect(sentBytes(sent[0]?.body)).toBe(atLimit);
  });

  describe("attack case A27: a body over 720 KiB", () => {
    it.each([
      ["text", (bytes: number) => "x".repeat(bytes)],
      ["text over the limit only in UTF-8", () => "€".repeat(atLimit / 3 + 1)],
      ["bytes", (bytes: number) => new Uint8Array(bytes)],
      ["an array buffer", (bytes: number) => new ArrayBuffer(bytes)],
      ["a form", formOf],
    ])("refuses %s and sends nothing", async (_what, make) => {
      const { http, sent, log } = client();
      const response = http.fetch("https://api.example.com/upload", post(make(atLimit + 1)));
      expect(await refusal(response)).toBe("request-too-large");
      expect(sent).toEqual([]);
      expect(log.entries()[0]).toMatchObject({ outcome: "refused", refusal: "request-too-large" });
    });

    it("counts the secret the kit places in a form field, and never names it", async () => {
      const { http, sent } = client();
      const placement = { secret: "client-secret", as: "form", field: "client_secret" } as const;
      const field = `&client_secret=${canary["client-secret"]}`;
      const body = formOf(atLimit - field.length + 1);
      const error = await http
        .fetch("https://oauth.example.com/token", post(body, placement))
        .catch((thrown: unknown) => thrown);
      expect(error).toMatchObject({ code: "request-too-large" });
      expect(String(error)).not.toContain(canary["client-secret"]);
      expect(sent).toEqual([]);
    });

    it.each([
      ["a blob", () => new Blob([new Uint8Array(atLimit + 1)])],
      ["a multipart form", () => new FormData()],
    ])("refuses %s, whose size the kit can't trust, and sends nothing", async (_what, make) => {
      const { http, sent } = client();
      expect(await refusal(http.fetch("https://api.example.com/upload", post(make())))).toBe(
        "body-not-supported",
      );
      expect(sent).toEqual([]);
    });
  });

  it("can be lowered, never raised", async () => {
    const lowered = client(undefined, { maxRequestBodyBytes: 10 });
    const small = lowered.http.fetch("https://api.example.com/", post("x".repeat(11)));
    expect(await refusal(small)).toBe("request-too-large");
    const raised = client(undefined, { maxRequestBodyBytes: 2 * atLimit });
    const large = raised.http.fetch("https://api.example.com/", post("x".repeat(atLimit + 1)));
    expect(await refusal(large)).toBe("request-too-large");
  });

  it.each([NaN, Infinity, -Infinity])("holds a limit of %s at 720 KiB", async (limit) => {
    const { http, sent } = client(undefined, { maxRequestBodyBytes: limit });
    const large = http.fetch("https://api.example.com/", post("x".repeat(atLimit + 1)));
    expect(await refusal(large)).toBe("request-too-large");
    await http.fetch("https://api.example.com/", post("x".repeat(atLimit)));
    expect(sentBytes(sent[0]?.body)).toBe(atLimit);
  });

  it("treats a negative limit as 0: no body at all", async () => {
    const { http, sent } = client(undefined, { maxRequestBodyBytes: -1 });
    const one = http.fetch("https://api.example.com/", post("x"));
    expect(await refusal(one)).toBe("request-too-large");
    await http.fetch("https://api.example.com/", post(""));
    await http.fetch("https://api.example.com/", { method: "GET" });
    expect(sent).toHaveLength(2);
  });
});
