import type { HttpClient } from "./http-client.ts";
import type { Secrets } from "./secrets.ts";
import type { TokenStore } from "./token-store.ts";

/** Version of the {@link ConnectorClient} and {@link ConnectorFactory} ports. A breaking change bumps it and comes with an ADR. */
export const connectorClientVersion = 1;

/** A tool a connector offers. */
export interface ConnectorTool {
  /** The tool's name, unique within its connector. */
  name: string;
  /** What the tool does, written for the model. */
  description: string;
  /** JSON Schema of the arguments object. */
  parameters: Record<string, unknown>;
}

/** A connection to one connector: an MCP server over HTTP or a local process, or a built-in one. */
export interface ConnectorClient {
  /** The connector's id in the workspace. */
  readonly id: string;
  /**
   * The tools the connector offers now. Connects on the first call.
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
