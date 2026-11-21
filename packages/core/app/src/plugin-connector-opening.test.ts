import {
  type ConnectorClient,
  type ConnectorConfig,
  type ConnectorFactory,
  type ConnectorFactoryContext,
  connectorStartFailureOf,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { digest, profileNumber, TestSandbox } from "./local-tool-fixtures.spec.ts";
import type { PluginPartUnavailable } from "./plugin-connector.ts";
import {
  openPluginConnector,
  type PluginBackendRequest,
  PluginConnectorNotTrustedError,
} from "./plugin-connector-opening.ts";
import { PluginLocalTools } from "./plugin-local-tools.ts";
import type { PluginTrustCheck } from "./plugin-trust.ts";
import { weatherManifest } from "./testing/plugin-fixtures.ts";
import { TestFolderReader } from "./testing/test-folder-reader.ts";

const fingerprint = "hfp1:weather";
const context = {
  secrets: {},
  tokens: {},
  http: {},
  trust: null,
} as unknown as ConnectorFactoryContext;

/** A local tool's factory whose connectors list the weather plugin's `list-files`. */
class ListingFactory implements ConnectorFactory {
  readonly transport = "stdio";

  create(config: ConnectorConfig): ConnectorClient {
    return {
      id: config.id,
      listTools: async () => [{ name: "list-files", description: "Lists.", parameters: {} }],
      callTool: async (name) => `local:${name}`,
      close: async () => undefined,
    };
  }
}

function setUp(
  options: { status?: PluginTrustCheck["status"]; sandbox?: TestSandbox | null } = {},
) {
  const plugins = new TestFolderReader().putFiles({
    "weather/plugin.yaml": weatherManifest,
    "weather/backend/index.js": "export default {};\n",
  });
  const backendRequests: PluginBackendRequest[] = [];
  const localToolSets: PluginLocalTools[] = [];
  const reported: { connector: string; unavailable: PluginPartUnavailable }[] = [];
  const sandbox = options.sandbox === undefined ? new TestSandbox() : options.sandbox;
  const startTrust = {
    plugins,
    digest,
    trust: {
      checkPlugin: async () =>
        ({ status: options.status ?? "trusted", fingerprint }) as PluginTrustCheck,
    },
  };
  const sources = {
    startTrust,
    openBackend: async (request: PluginBackendRequest): Promise<ConnectorClient> => {
      backendRequests.push(request);
      return {
        id: request.id,
        listTools: async () => [
          { name: "forecast", description: "Forecast.", parameters: {} },
          { name: "post-report", description: "Posts.", parameters: {} },
        ],
        callTool: async (name) => `backend:${name}`,
        close: async () => undefined,
      };
    },
    localTools: async (shared: Omit<ConnectorFactoryContext, "trust" | "sandbox">) => {
      const local = new PluginLocalTools({
        sandbox,
        factory: new ListingFactory(),
        context: shared,
        startTrust,
        prepare: async () => ({
          config: {
            id: "weather:files",
            transport: { kind: "stdio", command: "npx", args: [], env: {} },
            secretEnv: {},
          },
          profile: profileNumber(localToolSets.length),
        }),
      });
      localToolSets.push(local);
      return local;
    },
    onUnavailable: (connector: string, unavailable: PluginPartUnavailable) =>
      reported.push({ connector, unavailable }),
  };
  const open = () => openPluginConnector(sources, { id: "forecasts", plugin: "weather" }, context);
  return { open, backendRequests, localToolSets, reported, plugins };
}

verifies("app.plugin-connector-opening", () => {
  it("joins the backend and each local tool, opening the backend with the fingerprint found trusted", async () => {
    const { open, backendRequests } = setUp();
    const connector = open();
    const tools = await connector.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(["forecast", "post-report", "list-files"]);
    expect(await connector.callTool("list-files", {})).toBe("local:list-files");
    expect(
      backendRequests.map(({ id, plugin, fingerprint: found }) => ({ id, plugin, found })),
    ).toEqual([{ id: "forecasts", plugin: "weather", found: fingerprint }]);
  });

  it("starts nothing when the trust doesn't cover the plugin now", async () => {
    const { open, backendRequests, localToolSets } = setUp({ status: "changed" });
    const listing = open().listTools();
    await expect(listing).rejects.toThrow(
      /^Connector "forecasts" didn't start: The plugin weather changed/u,
    );
    const error = await listing.catch((caught: unknown) => caught);
    expect((error as Error).cause).toBeInstanceOf(PluginConnectorNotTrustedError);
    expect((error as Error).cause).toMatchObject({ reason: "changed" });
    expect(backendRequests).toEqual([]);
    expect(localToolSets).toEqual([]);
  });

  it("throws what the engine reads as a plugin not trusted yet, or changed since", async () => {
    const refusalOf = async (status: PluginTrustCheck["status"]) =>
      connectorStartFailureOf(
        await setUp({ status })
          .open()
          .listTools()
          .catch((caught: unknown) => caught),
      );
    expect(await refusalOf("new")).toEqual({ reason: "plugin-not-trusted", plugin: "weather" });
    expect(await refusalOf("changed")).toEqual({ reason: "plugin-changed", plugin: "weather" });
  });

  it("gives each connector local tools of its own", async () => {
    const { open, localToolSets } = setUp();
    await Promise.all([open().listTools(), open().listTools()]);
    expect(localToolSets).toHaveLength(2);
    expect(localToolSets[0]).not.toBe(localToolSets[1]);
  });

  it("tells the host which part can't start, with the connector's id", async () => {
    const { open, reported } = setUp({ sandbox: null });
    const tools = await open().listTools();
    expect(tools.map((tool) => tool.name)).toEqual(["forecast", "post-report"]);
    expect(
      reported.map(({ connector, unavailable }) => [
        connector,
        unavailable.part,
        unavailable.reason,
      ]),
    ).toEqual([["forecasts", "local:files", { kind: "needs-desktop-app" }]]);
  });

  it("gives the parts that can't start for the run's log, none before it opens", async () => {
    const { open } = setUp({ sandbox: null });
    const connector = open();
    expect(connector.newPartsOff?.()).toEqual([]);
    await connector.listTools();
    expect(connector.newPartsOff?.()).toEqual([
      { part: "local:files", reason: "needs-desktop-app" },
    ]);
    expect(connector.newPartsOff?.()).toEqual([]);
  });

  it("opens nothing for a connector closed before its first use", async () => {
    const { open, backendRequests, localToolSets } = setUp();
    await open().close();
    expect(backendRequests).toEqual([]);
    expect(localToolSets).toEqual([]);
  });
});

describe("openPluginConnector", () => {
  it("tries an open that failed again at the next use", async () => {
    const { open, plugins } = setUp();
    const connector = open();
    const backup = plugins.putFiles({ "weather/plugin.yaml": "id: [" });
    await expect(connector.listTools()).rejects.toMatchObject({ cause: { reason: "unreadable" } });
    backup.putFiles({ "weather/plugin.yaml": weatherManifest });
    expect((await connector.listTools()).length).toBe(3);
  });
});
