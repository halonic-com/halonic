import type { ConnectorClient } from "@halonicjs/ports";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { PluginRefusal } from "./plugin-refusal.ts";
import { pluginRoutes } from "./plugin-routes.ts";
import { type PluginBackends, PluginTable } from "./plugin-table.ts";

const token = randomLaunchToken();

/** A backend the fake host started: what was called on it, and whether it stopped. */
export class FakeBackend implements ConnectorClient {
  readonly id = "acme";
  readonly calls: { name: string; args: Record<string, unknown> }[] = [];
  closeCount = 0;
  failWith: Error | undefined;

  async listTools() {
    return [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    if (this.failWith !== undefined) throw this.failWith;
    this.calls.push({ name, args });
    return `called ${name}`;
  }

  async close(): Promise<void> {
    this.closeCount += 1;
  }
}

/** The trust and the start of a fake machine, which a test changes between calls. */
export class FakeBackends implements PluginBackends {
  /** The fingerprint each trusted plugin has now; a plugin that isn't here isn't trusted. */
  readonly trusted = new Map<string, string>([["acme", "hfp1:one"]]);
  readonly started: { plugin: string; backend: FakeBackend }[] = [];
  /** Set to refuse every start with this code, as a computer with no sandbox does. */
  refuseStart: "not_fenced" | undefined;

  async trustedFingerprint(plugin: string): Promise<string> {
    const fingerprint = this.trusted.get(plugin);
    if (fingerprint === undefined) throw new PluginRefusal("plugin_not_trusted");
    return fingerprint;
  }

  async open(plugin: string, fingerprint: string): Promise<ConnectorClient> {
    if (this.trusted.get(plugin) !== fingerprint) throw new PluginRefusal("plugin_not_trusted");
    if (this.refuseStart !== undefined) throw new PluginRefusal(this.refuseStart);
    const backend = new FakeBackend();
    this.started.push({ plugin, backend });
    return backend;
  }

  runnerSurvives(error: unknown): boolean {
    return error instanceof Error && error.name === "ToolError";
  }
}

export interface Setup {
  url: string;
  backends: FakeBackends;
  table: PluginTable;
  logged: string[];
  close(): Promise<void>;
}

/** Starts the plugin routes over fake backends. */
export async function startRoutes(options: { maxPlugins?: number } = {}): Promise<Setup> {
  const backends = new FakeBackends();
  const table = new PluginTable(backends, options);
  const logged: string[] = [];
  const server: HostServer = await startHostServer(
    token,
    pluginRoutes({ plugins: table, log: (text) => logged.push(text) }),
  );
  return {
    url: server.url,
    backends,
    table,
    logged,
    close: async () => {
      await table.closeAll();
      await server.close();
    },
  };
}

export function post(url: string, body: unknown): Promise<Response> {
  return fetch(`${url}/v1/plugins/call`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** A call of the plugin `acme`'s tool `echo`. */
export function callBody(change: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return { plugin: "acme", tool: "echo", args: { text: "hi" }, ...change };
}
