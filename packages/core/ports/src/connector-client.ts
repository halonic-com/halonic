import type { HttpClient } from "./http-client.ts";
import type { Secrets } from "./secrets.ts";
import type { TokenStore } from "./token-store.ts";

/** Version of the {@link ConnectorClient} and {@link ConnectorFactory} ports. A breaking change bumps it and comes with an ADR. */
export const connectorClientVersion = 1;

/**
 * What calling a tool can do. `read` changes nothing; `write` changes data,
 * such as mail, files or records; `send` reaches people outside, such as
 * sending a mail. Approvals, the "allow sending" check and shadow runs use it.
 */
export type ToolRisk = "read" | "write" | "send";

/** A tool a connector offers. */
export interface ConnectorTool {
  /** The tool's name, unique within its connector. */
  name: string;
  /** What the tool does, written for the model. */
  description: string;
  /** JSON Schema of the arguments object. */
  parameters: Record<string, unknown>;
  /**
   * What calling it can do. Absent means unknown: treat it as `write`. The
   * host ignores it for a tool an `http` or `stdio` connector lists (see
   * {@link ConnectorClient.listTools}).
   */
  risk?: ToolRisk;
  /**
   * Whether its result carries outside content (mail, web pages), which the
   * engine fences off. It covers the result only. For a tool an `http` or
   * `stdio` connector lists, the host fences everything anyway (see
   * {@link ConnectorClient.listTools}).
   */
  untrusted?: boolean;
}

/** A connection to one connector: an MCP server over HTTP or a local process, or a built-in one. */
export interface ConnectorClient {
  /** The connector's id in the workspace. */
  readonly id: string;
  /**
   * The tools the connector offers now. Connects on the first call.
   *
   * For an `http` or `stdio` connector, a server the workspace chose wrote
   * these tools. The host rebuilds their parameters from an allow-list,
   * fences off their descriptions and results as untrusted text, treats
   * their `risk` as `write` unless the workspace sets a lower one, and
   * refuses tools that are too large or whose names it can't check
   * (requirement `ports.untrusted-tool-listings`).
   * Don't fence them here, and don't mark them trusted.
   *
   * @throws when the connector can't be reached or started
   */
  listTools(): Promise<ConnectorTool[]>;
  /** Calls a tool and returns its text result. Throws on transport errors and tool errors. */
  callTool(name: string, args: Record<string, unknown>): Promise<string>;
  /** Release the connection (stop a local process). Safe to call twice. */
  close(): Promise<void>;
}

/**
 * The exact package version a package-runner connector (`npx`, `uvx` and the
 * others listed on the stdio transport) starts, and the registry it comes
 * from. It is stored in the trust record when a person trusts the workspace,
 * so it is per machine and never in a workspace file.
 *
 * It has no integrity hash, on purpose: `registryUrl` comes from the user's
 * profile, so the person already trusts that registry, and a Python package
 * has a different file, so a different hash, per platform. See the port
 * list ADR.
 *
 * @example
 * const pin: ConnectorPin = {
 *   registry: "npm",
 *   registryUrl: "https://registry.npmjs.org",
 *   package: "@acme/mail-mcp",
 *   version: "2.3.1",
 * };
 */
export interface ConnectorPin {
  /** `npm` for the npm runners (`npx`, `pnpm dlx`, `bunx` and so on), `pypi` for the Python ones (`uvx`, `pipx run`, `uv tool run`). */
  registry: "npm" | "pypi";
  /** The registry's address, taken from the user's profile, never from the workspace. */
  registryUrl: string;
  /** The package name, such as "@acme/mail-mcp". */
  package: string;
  /**
   * An exact version, such as "2.3.1". The adapter refuses to start on a tag
   * or a range (`latest`, `^2.3.1`, `>=2`) instead of resolving it.
   */
  version: string;
}

/** How to reach a connector. */
export type ConnectorTransport =
  | { kind: "http"; url: string; headers: Record<string, string> }
  | {
      kind: "stdio";
      command: string;
      args: string[];
      env: Record<string, string>;
      cwd?: string;
      /**
       * The version to start, for package-runner connectors. The app fills it
       * from the trust record, **never from workspace YAML**, so a workspace
       * edit can't choose the version or the registry.
       *
       * A package runner is a `command` whose program name, without its
       * folder, any case and any `.cmd`, `.exe`, `.bat` or `.ps1` ending, is
       * `npx`, `bunx` or `uvx`, or one of `npm exec`, `pnpm dlx`,
       * `yarn dlx`, `pipx run` and `uv tool run`. The adapter refuses to
       * start a package runner without a `pin`, so leaving the pin out
       * can't start whatever version is newest.
       *
       * When it is set, the adapter starts exactly `package` at `version`,
       * looks it up only at `registryUrl`, starts in an empty folder of its
       * own instead of `cwd`, ignores the workspace's package-manager
       * settings (`.npmrc`, `node_modules`, `uv.toml`, `pyproject.toml`), and
       * refuses to start when the command names any other version.
       *
       * It also refuses to start when `env` sets a variable, in any case,
       * that can move the registry or run code before the package:
       * `NODE_OPTIONS`, `NODE_PATH`, `PYTHONPATH`, `PYTHONSTARTUP`,
       * `PYTHONHOME`, or any name starting with `npm_config_`, `YARN_`,
       * `PNPM_`, `BUN_`, `COREPACK_`, `UV_`, `PIP_` or `PIPX_`. It drops
       * those it inherits from its own process and sets the registry from
       * `registryUrl` itself.
       */
      pin?: ConnectorPin;
    }
  /** Built-in Gmail and Drive for one account; `client` names the OAuth client secrets. */
  | { kind: "google"; account: string; client: string };

/** A connector as the workspace configures it. */
export interface ConnectorConfig {
  id: string;
  transport: ConnectorTransport;
  /** HTTP bearer token secret name. */
  secret?: string;
  /** stdio: environment variable -> secret name. */
  secretEnv: Record<string, string>;
}

/**
 * Proof that a person trusted the workspace a connector comes from.
 * `TrustService` in `core/app` checks the trust record against the
 * workspace's current fingerprint and hands out a grant only when they
 * match; adapters don't compute or compare fingerprints themselves.
 */
export interface TrustGrant {
  /** The trusted workspace's location: its resolved real path. */
  location: string;
  /** The fingerprint the person trusted, such as "hfp1:9f86d0…". */
  fingerprint: string;
}

/** What a factory may use to build a connector client. */
export interface ConnectorFactoryContext {
  secrets: Secrets;
  /** Where sign-ins keep their tokens, such as Google refresh tokens. */
  tokens: TokenStore;
  http: HttpClient;
  /** The workspace folder, for stdio connectors that run in it. Absent where programs can't start. */
  workspaceRoot?: string;
  /**
   * The trust grant for the connector's workspace, or `null` when it isn't
   * trusted. Required, so a caller can't forget it.
   *
   * Without a grant:
   * - a `stdio` connector never starts its program (`listTools` and
   *   `callTool` throw);
   * - an `http` connector's `callTool` always throws, because the only
   *   `risk` it sees is the one the server wrote;
   * - the built-in `google` connector's `callTool` throws for every tool
   *   whose own `risk` isn't `read`;
   * - the host ignores any `risk` the workspace sets, so every tool an
   *   `http` or `stdio` connector lists counts as `write`, and it refuses
   *   to call a tool whose risk isn't `read`.
   *
   * Both checks hold on their own, so a mistake in one doesn't open the gate
   * (requirement `ports.connector-trust-enforcement`).
   */
  trust: TrustGrant | null;
}

/** Creates connector clients for one transport kind. */
export interface ConnectorFactory {
  readonly transport: ConnectorTransport["kind"];
  create(config: ConnectorConfig, context: ConnectorFactoryContext): ConnectorClient;
}
