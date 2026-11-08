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

/** How to reach a connector. */
export type ConnectorTransport =
  | { kind: "http"; url: string; headers: Record<string, string> }
  | { kind: "stdio"; command: string; args: string[]; env: Record<string, string>; cwd?: string }
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

/** What a factory may use to build a connector client. */
export interface ConnectorFactoryContext {
  secrets: Secrets;
  /** Where sign-ins keep their tokens, such as Google refresh tokens. */
  tokens: TokenStore;
  http: HttpClient;
  /** The workspace folder, for stdio connectors that run in it. Absent where programs can't start. */
  workspaceRoot?: string;
}

/** Creates connector clients for one transport kind. */
export interface ConnectorFactory {
  readonly transport: ConnectorTransport["kind"];
  create(config: ConnectorConfig, context: ConnectorFactoryContext): ConnectorClient;
}
