import {
  IntegrationRefusedError,
  IntegrationTimeoutError,
} from "@halonicjs/adapter-integration-kit/integration";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { bridged, untilAborted } from "./bridged.test-helper.ts";
import { fakeKitClient } from "./pipes.test-helper.ts";

/** An endless body that counts how often it was read, and whether it was cancelled. */
function countedBody() {
  const counts = { pulls: 0, cancelled: false };
  const body = new ReadableStream<Uint8Array>(
    {
      pull: (controller) => {
        counts.pulls += 1;
        controller.enqueue(new TextEncoder().encode(`piece ${counts.pulls};`));
      },
      cancel: () => {
        counts.cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  return { body, counts };
}

verifies("integration-runner.requests", () => {
  describe("a request through the kit", () => {
    it("sends the URL, method, headers and secret placements, and gives back the head and body", async () => {
      const kit = fakeKitClient(() => {
        const response = new Response("sunny, 21 °C", {
          status: 203,
          statusText: "Not Quite",
          headers: { "content-type": "text/plain", "x-trace": "abc" },
        });
        Object.defineProperty(response, "url", { value: "https://api.example.com/v2/forecast" });
        return response;
      });
      const { run } = await bridged(async (host) => {
        const response = await host.http.fetch("https://api.example.com/v1/forecast?city=Ghent", {
          method: "POST",
          headers: { accept: "text/plain" },
          body: '{"city":"Ghent"}',
          auth: { secret: "example-key", as: "header", header: "x-api-key" },
        });
        const head = [
          response.status,
          response.statusText,
          response.url,
          response.headers.get("x-trace"),
        ];
        return `${head.join(" | ")} | ${await response.text()}`;
      }, kit);

      expect(await run()).toBe(
        "203 | Not Quite | https://api.example.com/v2/forecast | abc | sunny, 21 °C",
      );
      const [sent] = kit.sent;
      expect(sent?.url).toBe("https://api.example.com/v1/forecast?city=Ghent");
      expect(sent?.init).toMatchObject({
        method: "POST",
        headers: [["accept", "text/plain"]],
        body: '{"city":"Ghent"}',
        auth: [{ secret: "example-key", as: "header", header: "x-api-key" }],
      });
    });

    it("keeps a form a form, so the kit can still place a secret in a field", async () => {
      const kit = fakeKitClient(() => new Response(null, { status: 204 }));
      const { run } = await bridged(async (host) => {
        const response = await host.http.fetch("https://auth.example.com/token", {
          method: "POST",
          body: new URLSearchParams({ grant_type: "client_credentials", scope: "a b" }),
          auth: [{ secret: "client-secret", as: "form", field: "client_secret" }],
        });
        return `${response.status} ${response.body === null}`;
      }, kit);

      expect(await run()).toBe("204 true");
      const body = kit.sent[0]?.init.body;
      expect(body).toBeInstanceOf(URLSearchParams);
      expect(String(body)).toBe("grant_type=client_credentials&scope=a+b");
    });

    it("keeps bytes bytes", async () => {
      const kit = fakeKitClient(() => new Response("ok"));
      const bytes = new Uint8Array([0, 1, 2, 250, 255]);
      const { run } = await bridged(async (host) => {
        await host.http.fetch("https://api.example.com/upload", { method: "PUT", body: bytes });
        return "sent";
      }, kit);

      expect(await run()).toBe("sent");
      expect(kit.sent[0]?.init.body).toEqual(bytes);
    });

    it("reads the kit's body only when the integration reads, one piece per read", async () => {
      const { body, counts } = countedBody();
      const kit = fakeKitClient(() => new Response(body));
      const { run } = await bridged(async (host) => {
        const response = await host.http.fetch("https://api.example.com/v1/stream");
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        const first = await reader?.read();
        const second = await reader?.read();
        await reader?.cancel();
        return decoder.decode(first?.value) + decoder.decode(second?.value);
      }, kit);

      expect(await run()).toBe("piece 1;piece 2;");
      expect(counts).toEqual({ pulls: 2, cancelled: true });
    });

    it("passes a timeout of the kit while reading the body on as the kit's TimeoutError", async () => {
      const body = new ReadableStream<Uint8Array>({
        pull: (controller) => controller.error(new IntegrationTimeoutError("no data for 1000 ms")),
      });
      const kit = fakeKitClient(() => new Response(body));
      const { run } = await bridged(async (host) => {
        const response = await host.http.fetch("https://api.example.com/v1/slow");
        try {
          await response.text();
          return "read";
        } catch (error) {
          return `${(error as Error).name}: ${(error as Error).message}`;
        }
      }, kit);

      expect(await run()).toBe("TimeoutError: no data for 1000 ms");
    });

    it("aborts the kit's request when the integration's signal aborts", async () => {
      const kit = fakeKitClient(untilAborted);
      const { run } = await bridged(async (host) => {
        const abort = new AbortController();
        const request = host.http.fetch("https://api.example.com/v1/slow", {
          signal: abort.signal,
        });
        setTimeout(() => abort.abort(new DOMException("stop", "AbortError")), 10);
        try {
          await request;
          return "answered";
        } catch (error) {
          return (error as Error).name;
        }
      }, kit);

      expect(await run()).toBe("AbortError");
      await expect.poll(() => kit.sent[0]?.init.signal?.aborted).toBe(true);
    });
  });

  describe("what the runner refuses before anything crosses (A27)", () => {
    const refused: [string, NonNullable<RequestInit["body"]>, string][] = [
      ["text over 720 KiB", "x".repeat(720 * 1024 + 1), "request-too-large"],
      ["bytes over 720 KiB", new Uint8Array(720 * 1024 + 1), "request-too-large"],
      ["a Blob", new Blob(["data"]), "body-not-supported"],
      ["FormData", new FormData(), "body-not-supported"],
    ];
    for (const [what, body, code] of refused) {
      it(`refuses ${what} with ${code}`, async () => {
        const kit = fakeKitClient(() => new Response("ok"));
        const { run } = await bridged(async (host) => {
          try {
            await host.http.fetch("https://api.example.com/upload", { method: "POST", body });
            return "sent";
          } catch (error) {
            return error instanceof IntegrationRefusedError ? error.code : String(error);
          }
        }, kit);

        expect(await run()).toBe(code);
        expect(kit.sent).toEqual([]);
      });
    }

    it("sends a body of exactly 720 KiB", async () => {
      const kit = fakeKitClient(() => new Response("ok"));
      const { run } = await bridged(async (host) => {
        await host.http.fetch("https://api.example.com/upload", {
          method: "POST",
          body: new Uint8Array(720 * 1024),
        });
        return "sent";
      }, kit);

      expect(await run()).toBe("sent");
      expect(kit.sent).toHaveLength(1);
    });
  });
});
