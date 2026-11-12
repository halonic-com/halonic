import type {
  AddressCheckingHttpClient,
  LoadedIntegration,
} from "@halonicjs/adapter-integration-kit";
import type {
  HttpClient,
  IntegrationConnection,
  IntegrationHost,
  IntegrationTool,
} from "@halonicjs/ports";
import { describe, expect, it } from "vitest";
import { integrationConnectorClient } from "./integration-connector-client.ts";
import { loadLocalIntegration } from "./local-integration.ts";

const forecast: IntegrationTool = {
  name: "forecast",
  description: "Today's forecast for a city.",
  parameters: { type: "object" },
  risk: "read",
  untrusted: true,
};

const offlineTransport: HttpClient = { fetch: async () => new Response("{}") };

/** A loaded integration whose connections and calls the test can count. */
function loaded() {
  const seen = { connects: 0, closes: 0, calls: [] as string[] };
  const host = {} as IntegrationHost;
  const connection: IntegrationConnection = {
    callTool: async (name, args) => {
      seen.calls.push(`${name}:${JSON.stringify(args)}`);
      return "sunny";
    },
    // A tool the sheet doesn't name; it must not be offered.
    listTools: async () => [forecast, { ...forecast, name: "extra" }],
    close: async () => {
      seen.closes += 1;
    },
  };
  const value = {
    host,
    integration: {
      name: "weather",
      version: "1.0.0",
      tools: [forecast],
      connect: () => {
        seen.connects += 1;
        return connection;
      },
    },
  } as unknown as LoadedIntegration;
  return { seen, value };
}

describe("integrationConnectorClient", () => {
  it("offers the sheet's tools and no others", async () => {
    const client = integrationConnectorClient({ id: "weather", loaded: loaded().value });
    expect((await client.listTools()).map((tool) => tool.name)).toEqual(["forecast"]);
  });

  it("calls a tool through the connection, connecting only on the first call", async () => {
    const { seen, value } = loaded();
    const client = integrationConnectorClient({ id: "weather", loaded: value });
    await client.listTools();
    expect(seen.connects).toBe(0);
    expect(await client.callTool("forecast", { city: "Ghent" })).toBe("sunny");
    await client.callTool("forecast", { city: "Oslo" });
    expect(seen.connects).toBe(1);
    expect(seen.calls).toEqual(['forecast:{"city":"Ghent"}', 'forecast:{"city":"Oslo"}']);
  });

  it("refuses a tool the sheet doesn't name", async () => {
    const { seen, value } = loaded();
    const client = integrationConnectorClient({ id: "weather", loaded: value });
    await expect(client.callTool("extra", {})).rejects.toThrow(
      'weather: it offers no tool named "extra"',
    );
    expect(seen.calls).toEqual([]);
  });

  it("is not local unless it says so", () => {
    expect(integrationConnectorClient({ id: "a", loaded: loaded().value }).local).toBeUndefined();
    expect(integrationConnectorClient({ id: "a", loaded: loaded().value, local: true }).local).toBe(
      true,
    );
  });

  it("closes the connection once and refuses every call after", async () => {
    const { seen, value } = loaded();
    const client = integrationConnectorClient({ id: "weather", loaded: value });
    await client.callTool("forecast", {});
    await client.close();
    await client.close();
    expect(seen.closes).toBe(1);
    await expect(client.callTool("forecast", {})).rejects.toThrow(
      "weather: its connection is closed",
    );
    await expect(client.listTools()).rejects.toThrow("its connection is closed");
    expect(seen.connects).toBe(1);
  });

  it("closing a client that never connected stops the runner the load started", async () => {
    let runnerClosed = 0;
    const tool = {
      name: "forecast",
      description: "Today's forecast for a city.",
      parameters: {
        type: "object",
        properties: { city: { type: "string", description: "The city." } },
        required: ["city"],
      },
      risk: "read" as const,
      untrusted: true,
    };
    const sheet = {
      id: "weather",
      version: "1.0.0",
      kit: 1,
      provides: ["connector"],
      hosts: [],
      secrets: {},
      tools: [
        {
          name: "forecast",
          description: tool.description,
          arguments: { city: "The city." },
          risk: "read",
          untrusted: true,
        },
      ],
    };
    const loadedIntegration = await loadLocalIntegration({
      sheet,
      approvedSheet: sheet,
      folder: "/work/weather",
      folderDisk: {
        entries: () => [{ name: "index.js", kind: "file" }],
        realPath: (path) => path,
        identity: (file) => ({ id: file, names: 1 }),
      },
      choices: { secretNames: {} },
      transport: offlineTransport as AddressCheckingHttpClient,
      secrets: { get: async () => null },
      tokens: { get: async () => null, set: async () => undefined, remove: async () => undefined },
      start: async () => ({
        declaration: { name: "weather", version: "1.0.0", tools: [tool] },
        stopped: new Promise(() => undefined),
        callTool: async () => "sunny",
        close: async () => {
          runnerClosed += 1;
        },
      }),
    });
    if (!loadedIntegration.ok) expect.fail(JSON.stringify(loadedIntegration.error));
    const client = integrationConnectorClient({ id: "weather", loaded: loadedIntegration.value });
    await client.listTools();
    await client.close();
    expect(runnerClosed).toBe(1);
  });
});
