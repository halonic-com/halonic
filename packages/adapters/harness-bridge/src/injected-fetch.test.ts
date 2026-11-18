import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { harnessBridgeTokenHeader } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { anthropicRoute } from "./anthropic-route.ts";
import { openBridge } from "./bridge.ts";
import { fakeProvider } from "./fake-provider.test-helper.ts";
import { fakeRun } from "./fakes.test-helper.ts";
import { openAiRoute } from "./openai-route.ts";
import { providerHostClass } from "./provider-hosts.ts";
import type { BridgeRoute } from "./route.ts";

const closers: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

const sourceFolder = import.meta.dirname;

/** The bridge's own source files: no test, no test helper. */
function sourceFiles(): string[] {
  return readdirSync(sourceFolder).filter(
    (name) => name.endsWith(".ts") && !name.includes(".test"),
  );
}

async function openWith(route: BridgeRoute, provider: "anthropic" | "openai") {
  const bridge = await openBridge(
    {
      ...fakeRun(),
      providers: { [provider]: { kind: "key", secret: "key" } },
      recorder: { record: async () => {} },
    },
    {
      place: { kind: "loopback" },
      limits: { maxBytes: 1024 * 1024, timeoutMs: 5_000 },
      closeTimeoutMs: 1_000,
      routes: [route],
    },
  );
  closers.push(bridge.close);
  return bridge;
}

const secrets = { get: async () => "test-value" };
const limits = { responseTimeoutMs: 2_000, idleTimeoutMs: 500 };

verifies("harness-bridge.injected-fetch", () => {
  it("never reaches for Node's own fetch (C5)", () => {
    const files = sourceFiles();
    expect(files.length).toBeGreaterThan(10);
    for (const name of files) {
      const text = readFileSync(join(sourceFolder, name), "utf8");
      expect(text, `${name} names globalThis.fetch`).not.toMatch(/globalThis\s*\.\s*fetch/);
    }
  });

  describe("the provider host class", () => {
    it.each(["https://api.anthropic.com/v1/messages", "https://api.openai.com/v1/responses?x=1"])(
      "is public for %s",
      (url) => {
        expect(providerHostClass(new URL(url))).toBe("public");
      },
    );

    it.each([
      "http://api.anthropic.com/",
      "https://api.anthropic.com:8443/",
      "https://example.com/",
      "https://api.anthropic.com.example.com/",
      "https://evil.api.openai.com/",
      "https://127.0.0.1/",
    ])("is undefined for %s", (url) => {
      expect(providerHostClass(new URL(url))).toBeUndefined();
    });
  });

  describe("a reply the client already decoded", () => {
    const body = "decoded body";
    const encoded = {
      "content-type": "application/json",
      "content-encoding": "gzip",
      "content-length": "3",
    };

    it.each([
      [
        "Anthropic",
        "anthropic",
        "/v1/messages",
        { model: "claude-sonnet-5-5", max_tokens: 16, messages: [{ role: "user", content: "hi" }] },
      ],
      ["OpenAI", "openai", "/v1/responses", { model: "gpt-5", input: "hi" }],
    ] as const)(
      "reaches the program from %s without either header",
      async (_name, provider, path, request) => {
        const upstream = fakeProvider(() => new Response(body, { headers: encoded }));
        const route =
          provider === "anthropic"
            ? anthropicRoute({ secrets, fetch: upstream.fetch, limits })
            : openAiRoute({ secrets, fetch: upstream.fetch, limits });
        const bridge = await openWith(route, provider);

        const reply = await fetch(`${bridge.url}${path}`, {
          method: "POST",
          headers: { [harnessBridgeTokenHeader]: bridge.token, "content-type": "application/json" },
          body: JSON.stringify(request),
        });

        expect(await reply.text()).toBe(body);
        expect(reply.headers.get("content-encoding")).toBeNull();
        expect(reply.headers.get("content-length")).toBeNull();
        expect(reply.headers.get("content-type")).toBe("application/json");
      },
    );
  });
});
