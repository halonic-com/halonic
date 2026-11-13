import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryTrustStore } from "@halonicjs/adapter-memory";
import type {
  ConnectorCallOptions,
  ConnectorClient,
  ConnectorConfig,
  ConnectorFactory,
  ConnectorFactoryContext,
  ConnectorTool,
  TrustRecord,
} from "@halonicjs/ports";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { connectorRoutes } from "./connector-routes.ts";
import type { OpenConnectorBody } from "./connector-schemas.ts";
import { ConnectorTable } from "./connector-table.ts";

export const token = randomLaunchToken();

/** The fingerprint the test workspace's record holds. */
export const trustedFingerprint = "hfp1:test";

/** A trust record for `workspace`, as `halonic trust` saves it, holding the connector that {@link openBody} describes. */
export function trustRecord(workspace: string): TrustRecord {
  return {
    location: workspace,
    fingerprint: trustedFingerprint,
    content: {
      connectors: [
        {
          id: "notes",
          transport: "stdio",
          settings: {
            command: "node",
            args: ["tools/notes.js"],
            cwd: ".",
            env: { MODE: "test" },
            secretEnv: { NOTES_KEY: "‹secret notes-key›" },
            sites: ["api.example.test"],
          },
          tools: { approve: "all" },
        },
      ],
    },
    grantedAt: "2026-11-12T10:00:00.000Z",
    appVersion: "0.0.0",
    pins: {},
    origin: "cli",
  };
}

/** A connector the fake factory made: what it was given, and what was called on it. */
export class FakeConnector implements ConnectorClient {
  readonly id: string;
  readonly config: ConnectorConfig;
  readonly context: ConnectorFactoryContext;
  readonly calls: {
    name: string;
    args: Record<string, unknown>;
    options?: ConnectorCallOptions;
  }[] = [];
  closeCount = 0;
  failWith: Error | undefined;

  constructor(config: ConnectorConfig, context: ConnectorFactoryContext) {
    this.id = config.id;
    this.config = config;
    this.context = context;
  }

  async listTools(): Promise<ConnectorTool[]> {
    if (this.failWith !== undefined) throw this.failWith;
    return [{ name: "echo", description: "Echoes.", parameters: { type: "object" } }];
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    options?: ConnectorCallOptions,
  ): Promise<string> {
    if (this.failWith !== undefined) throw this.failWith;
    this.calls.push({ name, args, ...(options === undefined ? {} : { options }) });
    return `called ${name}`;
  }

  async close(): Promise<void> {
    this.closeCount += 1;
  }
}

/** Folders on disk: the workspace the launcher named, another one it didn't, and an agent's folder. */
export interface Folders {
  base: string;
  workspace: string;
  other: string;
  agent: string;
}

export interface Setup {
  url: string;
  table: ConnectorTable;
  /** The host's trust records: the workspace is trusted with {@link trustedFingerprint}, as the default open request has it. */
  trust: MemoryTrustStore;
  made: FakeConnector[];
  folders: Folders;
  close(): Promise<void>;
}

/** Starts the routes with a fake factory, over real folders. */
export async function startRoutes(
  options: {
    maxConnectors?: number;
    whileCreating?: (table: ConnectorTable) => void;
    /** Leave the workspace without a trust record. */
    untrusted?: boolean;
  } = {},
): Promise<Setup> {
  const base = await realpath(await mkdtemp(join(tmpdir(), "agent-host-connector-")));
  const folders: Folders = {
    base,
    workspace: join(base, "workspace"),
    other: join(base, "other"),
    agent: join(base, "workspace", "files", "agents", "coder"),
  };
  await mkdir(folders.agent, { recursive: true });
  await mkdir(folders.other);
  const made: FakeConnector[] = [];
  const factory: ConnectorFactory = {
    transport: "stdio",
    create(config, context) {
      const connector = new FakeConnector(config, context);
      made.push(connector);
      options.whileCreating?.(table);
      return connector;
    },
  };
  const table = new ConnectorTable(options);
  const trust = new MemoryTrustStore();
  if (options.untrusted !== true) await trust.grant(trustRecord(folders.workspace));
  const routes = connectorRoutes({
    factory,
    connectors: table,
    workspaceRoots: [folders.workspace],
    http: { fetch: async () => new Response("") },
    trustStore: trust,
    tokens: { get: async () => null, set: async () => {}, remove: async () => {} } as never,
  });
  const server: HostServer = await startHostServer(token, routes);
  return {
    url: server.url,
    table,
    trust,
    made,
    folders,
    close: async () => {
      await table.closeAll();
      await server.close();
      await rm(base, { recursive: true, force: true });
    },
  };
}

export function post(url: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${url}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** An open request for a connector in the workspace. Not a real secret value. */
export function openBody(
  folders: Folders,
  change: Partial<Record<string, unknown>> = {},
): OpenConnectorBody {
  return {
    id: "notes",
    command: "node",
    args: ["tools/notes.js"],
    env: { MODE: "test" },
    sites: ["api.example.test"],
    secretEnv: { NOTES_KEY: "notes-key" },
    secrets: { "notes-key": "fake-value-for-test" },
    workspaceRoot: folders.workspace,
    workingFolders: [folders.agent],
    trust: { location: folders.workspace, fingerprint: trustedFingerprint },
    ...change,
  } as OpenConnectorBody;
}

export { symlink };
