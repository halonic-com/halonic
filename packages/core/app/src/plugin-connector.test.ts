import type { ConnectorClient, ConnectorTool } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { PluginBackendNotTrustedError } from "./plugin-backend.ts";
import {
  PluginConnector,
  type PluginConnectorPart,
  type PluginPartUnavailable,
  pluginPartUnavailableReason,
} from "./plugin-connector.ts";
import { LocalToolSettingsNotSetError } from "./plugin-local-tool-config.ts";
import { LocalToolUnavailableError, PluginLocalToolNotTrustedError } from "./plugin-local-tools.ts";

/** A part's connector that lists `names`, or fails with `fails`, and records its calls. */
class TestPartClient implements ConnectorClient {
  readonly id: string;
  readonly calls: string[] = [];
  closed = 0;
  listings = 0;
  fails: unknown;
  callFails: unknown;
  closeFails: unknown;
  readonly #names: readonly string[];

  constructor(id: string, names: readonly string[]) {
    this.id = id;
    this.#names = names;
  }

  async listTools(): Promise<ConnectorTool[]> {
    this.listings += 1;
    if (this.fails !== undefined) throw this.fails;
    return this.#names.map((name) => ({ name, description: name, parameters: {} }));
  }

  async callTool(name: string): Promise<string> {
    if (this.fails !== undefined) throw this.fails;
    if (this.callFails !== undefined) throw this.callFails;
    this.calls.push(name);
    return `${this.id}:${name}`;
  }

  async close(): Promise<void> {
    this.closed += 1;
    if (this.closeFails !== undefined) throw this.closeFails;
  }
}

function setUp() {
  const backend = new TestPartClient("backend", ["forecast", "debug"]);
  const files = new TestPartClient("files", ["read-note"]);
  const parts: PluginConnectorPart[] = [
    { part: "backend", declared: ["forecast"], client: backend },
    { part: "local:files", declared: ["read-note"], client: files },
  ];
  const reported: PluginPartUnavailable[] = [];
  const connector = new PluginConnector({
    id: "weather",
    plugin: "weather",
    parts,
    onUnavailable: (unavailable) => reported.push(unavailable),
  });
  return { backend, files, connector, reported };
}

const noSandbox = new LocalToolUnavailableError("weather:files", { kind: "needs-desktop-app" });

verifies("app.plugin-connector", () => {
  it("offers each part's declared tools and sends a call to the part that declares it", async () => {
    const { backend, files, connector } = setUp();
    const tools = await connector.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(["forecast", "read-note"]);
    expect(await connector.callTool("read-note", {})).toBe("files:read-note");
    expect(files.calls).toEqual(["read-note"]);
    expect(backend.calls).toEqual([]);
  });

  it("refuses a call to a tool no part declares without reaching any part", async () => {
    const { backend, files, connector } = setUp();
    await expect(connector.callTool("debug", {})).rejects.toThrow(
      'The plugin weather declares no tool "debug".',
    );
    expect([...backend.calls, ...files.calls]).toEqual([]);
  });

  it("leaves out a part that can't start and reports it once", async () => {
    const { files, connector, reported } = setUp();
    files.fails = noSandbox;
    expect((await connector.listTools()).map((tool) => tool.name)).toEqual(["forecast"]);
    expect((await connector.listTools()).map((tool) => tool.name)).toEqual(["forecast"]);
    expect(reported).toEqual([
      {
        plugin: "weather",
        part: "local:files",
        reason: { kind: "needs-desktop-app" },
        error: noSandbox,
      },
    ]);
  });

  it("fails the listing with the first part's error when no part starts", async () => {
    const { backend, files, connector, reported } = setUp();
    const notSet = new LocalToolSettingsNotSetError("weather:files", ["city"]);
    backend.fails = new Error("the runner didn't start");
    files.fails = notSet;
    await expect(connector.listTools()).rejects.toThrow("the runner didn't start");
    expect(reported.map(({ part, reason }) => ({ part, reason }))).toEqual([
      { part: "backend", reason: { kind: "failed" } },
      { part: "local:files", reason: { kind: "settings-not-set", settings: ["city"] } },
    ]);
  });

  it("reports a part a call finds can't start, unless it was reported already", async () => {
    const { files, connector, reported } = setUp();
    files.fails = noSandbox;
    await expect(connector.callTool("read-note", {})).rejects.toBe(noSandbox);
    await connector.listTools();
    expect(reported.map(({ part }) => part)).toEqual(["local:files"]);
  });

  it("doesn't report a tool's own error", async () => {
    const { backend, connector, reported } = setUp();
    backend.callFails = new Error("no forecast for that city");
    await expect(connector.callTool("forecast", {})).rejects.toThrow("no forecast for that city");
    expect(reported).toEqual([]);
  });

  it("closes every part, even when one fails to close", async () => {
    const { backend, files, connector } = setUp();
    backend.closeFails = new Error("the runner didn't stop");
    await expect(connector.close()).rejects.toThrow("the runner didn't stop");
    expect([backend.closed, files.closed]).toEqual([1, 1]);
  });
});

describe("pluginPartUnavailableReason", () => {
  it("gives each part's own code", () => {
    expect(pluginPartUnavailableReason(noSandbox)).toEqual({ kind: "needs-desktop-app" });
    expect(
      pluginPartUnavailableReason(new PluginLocalToolNotTrustedError("weather", "changed")),
    ).toEqual({ kind: "not-trusted", reason: "changed" });
    expect(
      pluginPartUnavailableReason(new PluginBackendNotTrustedError("weather", "not-trusted")),
    ).toEqual({ kind: "not-trusted", reason: "not-trusted" });
    expect(pluginPartUnavailableReason(new Error("anything else"))).toEqual({ kind: "failed" });
  });
});
