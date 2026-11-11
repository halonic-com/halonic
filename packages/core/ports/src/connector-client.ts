import type { HttpClient } from "./http-client.ts";
import type { SandboxSession } from "./sandbox.ts";
import type { Secrets } from "./secrets.ts";
import type { TokenStore } from "./token-store.ts";

/** Version of the {@link ConnectorClient} and {@link ConnectorFactory} ports. A breaking change bumps it and comes with an ADR. */
export const connectorClientVersion = 1;

/**
 * What calling a tool can do. `read` changes nothing; `write` changes data,
 * such as mail, files or records; `send` reaches people outside, such as
 * sending a mail. Approvals use it.
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

/**
 * Hints for one tool call. Each is optional, and an adapter may ignore any
 * of them: no caller's correctness depends on an adapter using one (port
 * list ADR, "Additive after the freeze: optional hints").
 */
export interface ConnectorCallOptions {
  /**
   * The same for every attempt at one call, such as `<runId>:<callId>`
   * when a person has a run try a call again. An adapter may pass it on,
   * so a server that knows it can drop a duplicate, and may ignore it.
   */
  readonly idempotencyKey?: string;
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
  /**
   * Calls a tool and returns its text result. Throws on transport errors and tool errors.
   *
   * `options` holds hints (`ports.connector-call-hints`): an adapter may
   * use them and may ignore them, and the call must work either way.
   */
  callTool(
    name: string,
    args: Record<string, unknown>,
    options?: ConnectorCallOptions,
  ): Promise<string>;
  /** Release the connection (stop a local process). Safe to call twice. */
  close(): Promise<void>;
}

/**
 * The exact package version a package-runner connector (`npx`, `uvx` and the
 * others listed on the stdio transport) starts, and the registry it comes
 * from. It is stored in the trust record when a person trusts the workspace,
 * so it is per machine and never in a workspace file.
 *
 * It has no integrity hash, on purpose: the person already trusts the
 * registry, and a Python package has a different file, so a different hash,
 * per platform. See the port list ADR. For a workspace connector,
 * `registryUrl` comes from the user's profile. For a plugin's local tool it
 * comes from the plugin's manifest, or is the runner's public registry, and
 * the person sees it in the trust prompt before trusting the plugin (plugins
 * ADR, section 1.2).
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
  /**
   * The registry's base address, such as "https://pypi.org", never its index
   * (the launcher adds `/simple` itself). Never from a workspace: from the
   * user's profile, or for a plugin from its trusted manifest.
   */
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
       * `yarn dlx`, `pipx run` and `uv tool run`. Without a `pin`, a package
       * runner starts only with a trust grant, like every stdio program, and
       * its `command` and `args` are in the fingerprint the person confirmed.
       * The version it runs is not fixed: the runner may start whatever
       * version is newest. Pinning at trust comes later.
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
       * `PNPM_`, `BUN_`, `COREPACK_`, `UV_`, `PIP_` or `PIPX_`; a proxy,
       * `HTTPS_PROXY`, `HTTP_PROXY` or `ALL_PROXY`; a certificate setting,
       * `NODE_EXTRA_CA_CERTS`, `NODE_TLS_REJECT_UNAUTHORIZED`,
       * `SSL_CERT_FILE`, `SSL_CERT_DIR`, `REQUESTS_CA_BUNDLE` or
       * `CURL_CA_BUNDLE`; or a preload, `LD_PRELOAD`, `LD_LIBRARY_PATH`,
       * `DYLD_INSERT_LIBRARIES` or `DYLD_LIBRARY_PATH`. It drops the
       * package-manager and language variables it inherits from its own
       * process and sets the registry from `registryUrl` itself. It keeps an
       * inherited proxy, certificate or preload: those are the person's own
       * machine settings, such as a company proxy, not the workspace's.
       *
       * And it refuses to start when an argument is a runner option that
       * fetches from somewhere else: `--registry`, an npm scope's
       * `--@<scope>:registry`, `--userconfig`, `--globalconfig`, `--cache`,
       * `--index-url` (`-i`), `--extra-index-url`, `--index`,
       * `--default-index`, `--find-links` (`-f`), `--config-file`,
       * `--cache-dir` or `--pip-args`.
       *
       * Every stdio launcher checks these rules with `@halonicjs/app`'s
       * `checkPackageRunnerLaunch`, so they live in one place.
       */
      pin?: ConnectorPin;
    }
  /** Built-in Gmail and Drive for one account; `client` names no secret. */
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
  /**
   * The sandbox session a `stdio` connector starts its program in, for a
   * plugin's local tool (plugins ADR, sections 3 and 4). Halonic opens it
   * with a profile it builds itself, never the plugin.
   *
   * When it is set, the program starts in this session and nowhere else:
   * - only a factory that starts programs through a session takes it; a
   *   factory that starts programs on this computer refuses the context, so
   *   a wiring mistake can't run a plugin's program outside the fence;
   * - a session whose fence proof isn't `fenced` starts nothing, and there
   *   is no fallback to this computer. A person's yes to run without the
   *   sandbox doesn't cover programs.
   *
   * Absent for a workspace's own connectors, which start as before.
   */
  sandbox?: SandboxSession;
}

/** Creates connector clients for one transport kind. */
export interface ConnectorFactory {
  readonly transport: ConnectorTransport["kind"];
  create(config: ConnectorConfig, context: ConnectorFactoryContext): ConnectorClient;
}
