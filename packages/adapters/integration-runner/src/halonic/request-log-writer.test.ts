import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressCheckingHttpClient } from "@halonicjs/adapter-integration-kit";
import { type RequestLogFiles, RequestLogStore } from "@halonicjs/app";
import type { HttpClient } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fakeSecret } from "../pipes.test-helper.ts";
import { RunnerToolError } from "./limits.ts";
import { loadLocalIntegration } from "./local-integration.ts";

const workspace = "0123456789abcdef0123456789abcdef";
const canaryReply = "canary-reply-body-7f3a";

const sheet = {
  id: "weather",
  version: "1.0.0",
  kit: 1,
  provides: ["connector"],
  hosts: ["api.example.com"],
  secrets: {
    "weather-key": { purpose: "Reads the forecast.", hosts: ["api.example.com"], as: "bearer" },
  },
  tools: [
    {
      name: "forecast",
      description: "The forecast.",
      arguments: {},
      risk: "read",
      untrusted: true,
    },
  ],
};

// Answers every request with the canary body, without a network.
const canaryTransport: HttpClient = { fetch: async () => new Response(canaryReply) };

/** Keeps the store's files in memory, so the test reads exactly the text that would be written. */
function memoryFiles(): RequestLogFiles & { texts: Map<string, string> } {
  const texts = new Map<string, string>();
  return {
    texts,
    read: async (folder, file) => texts.get(`${folder}/${file}`),
    write: async (folder, file, text) => {
      texts.set(`${folder}/${file}`, text);
    },
    remove: async (folder, file) => {
      texts.delete(`${folder}/${file}`);
    },
    removeWorkspace: async () => undefined,
  };
}

verifies("app.integration-request-log", () => {
  let folder: string;

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), "halonic-weather-"));
    await writeFile(
      join(folder, "index.js"),
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the integration's code, as text
      "http.fetch(`https://api.example.com/v2/forecast/${city}`);",
    );
  });

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  it("writes each request masked and each failed call's note, with neither the secret nor the reply", async () => {
    const files = memoryFiles();
    const loaded = await loadLocalIntegration({
      sheet,
      approvedSheet: sheet,
      folder,
      choices: { secretNames: { "weather-key": "example-key" } },
      transport: canaryTransport as AddressCheckingHttpClient,
      secrets: { get: async (name) => (name === "example-key" ? fakeSecret : null) },
      tokens: { get: async () => null, set: async () => undefined, remove: async () => undefined },
      requestLog: { store: new RequestLogStore(files), workspace },
      start: async (bridge) => ({
        declaration: {
          name: "weather",
          version: "1.0.0",
          tools: [
            {
              name: "forecast",
              description: "The forecast.",
              parameters: { type: "object", properties: {} },
              risk: "read",
              untrusted: true,
            },
          ],
        },
        stopped: new Promise(() => undefined),
        close: async () => undefined,
        callTool: async () => {
          const reply = await bridge.http.fetch("https://api.example.com/v2/forecast/Ghent?day=1", {
            auth: { secret: "weather-key", as: "bearer" },
          });
          await reply.text();
          throw new RunnerToolError("the reply changed", {
            kind: "unavailable",
            failureCause: { code: "reply-changed", detail: { "field.1": "today.high" } },
          });
        },
      }),
    });
    if (!loaded.ok) expect.fail(JSON.stringify(loaded.error));
    const { integration, host } = loaded.value;
    await expect(integration.connect(host).callTool("forecast", {})).rejects.toThrow(
      RunnerToolError,
    );

    await vi.waitFor(() =>
      expect(files.texts.get(`${workspace}/weather.jsonl`)).toContain("failure"),
    );
    const text = files.texts.get(`${workspace}/weather.jsonl`) ?? "";
    expect(text).not.toContain(fakeSecret);
    expect(text).not.toContain(canaryReply);
    expect(text).not.toContain("Ghent");
    expect(
      text
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
    ).toMatchObject([
      { type: "request", host: "api.example.com", path: "/v2/forecast/{…}", status: 200 },
      { type: "failure", tool: "forecast", kind: "unavailable", fields: ["today.high"] },
    ]);
  });
});
