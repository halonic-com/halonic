import {
  type ConnectorClient,
  type ConnectorConfig,
  type ConnectorFactory,
  type ConnectorFactoryContext,
  type ConnectorTool,
  ConnectorToolError,
} from "@halonicjs/ports";
import { McpError } from "../protocol/errors.ts";
import { type ClientInfo, McpSession } from "../protocol/session.ts";
import { SecretNotSetError } from "../stdio/start-errors.ts";
import { resultText, toConnectorTool, toolTimeoutOf } from "../stdio/tool-mapping.ts";
import { defaultHttpLimits, type HttpLimits, McpHttpTransport } from "./http-transport.ts";

/** What an HTTP connector factory needs besides each connector's config. */
export interface McpHttpOptions {
  /** How Halonic introduces itself to the server. */
  readonly clientInfo: ClientInfo;
  readonly limits?: HttpLimits;
}

/** How to reach one HTTP connector's server. */
type HttpConfig = Extract<ConnectorConfig["transport"], { kind: "http" }>;

/**
 * Creates MCP connectors that talk to a server over streamable HTTP,
 * through the context's `http`, so the host decides which addresses a
 * connector may reach.
 *
 * Listing and calling tools both need a trust grant, as for a `stdio`
 * connector: without one, every call throws before it starts a session,
 * and the only `risk` a tool has is the one the server wrote
 * (`ports.connector-trust-enforcement`).
 */
export class McpHttpConnectorFactory implements ConnectorFactory {
  readonly transport = "http";
  readonly #options: McpHttpOptions;

  constructor(options: McpHttpOptions) {
    this.#options = options;
  }

  create(config: ConnectorConfig, context: ConnectorFactoryContext): ConnectorClient {
    if (config.transport.kind !== "http") {
      throw new Error(
        `Connector "${config.id}" uses ${config.transport.kind}, but this factory serves http.`,
      );
    }
    return new McpHttpConnector(config, config.transport, context, this.#options);
  }
}

class McpHttpConnector implements ConnectorClient {
  readonly id: string;
  readonly #config: ConnectorConfig;
  readonly #http: HttpConfig;
  readonly #context: ConnectorFactoryContext;
  readonly #options: McpHttpOptions;
  #connecting: Promise<McpSession> | undefined;
  #closed = false;

  constructor(
    config: ConnectorConfig,
    http: HttpConfig,
    context: ConnectorFactoryContext,
    options: McpHttpOptions,
  ) {
    this.id = config.id;
    this.#config = config;
    this.#http = http;
    this.#context = context;
    this.#options = options;
  }

  async listTools(): Promise<ConnectorTool[]> {
    this.#requireTrust("lists");
    const session = await this.#connect();
    const tools = await session.listTools().catch((error: unknown) => this.#forget(error));
    return tools.map(toConnectorTool);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    this.#requireTrust("calls");
    const session = await this.#connect();
    const result = await session
      .callTool(name, args)
      .catch((error: unknown) => this.#forget(toolTimeoutOf(this.id, name, error, false) ?? error));
    if (result.isError) throw new ConnectorToolError(this.id, name, resultText(result));
    return resultText(result);
  }

  async close(): Promise<void> {
    this.#closed = true;
    const connecting = this.#connecting;
    this.#connecting = undefined;
    // A session that never started has nothing to end on the server.
    const session = await connecting?.catch(() => undefined);
    await session?.close();
  }

  /** Checked before connecting, so an untrusted workspace's call starts nothing. */
  #requireTrust(verb: "lists" | "calls"): void {
    if (this.#context.trust === null) {
      throw new Error(
        `Connector "${this.id}" ${verb} its tools only once the workspace is trusted.`,
      );
    }
  }

  /** Starts the session on the first call. A start that fails is tried again on the next call. */
  #connect(): Promise<McpSession> {
    if (this.#closed) return Promise.reject(new Error(`Connector "${this.id}" is closed.`));
    this.#connecting ??= this.#start().catch((error: unknown) => {
      this.#connecting = undefined;
      throw error;
    });
    return this.#connecting;
  }

  async #start(): Promise<McpSession> {
    const transport = new McpHttpTransport({
      http: this.#context.http,
      url: this.#http.url,
      headers: await this.#headers(),
      limits: this.#options.limits ?? defaultHttpLimits,
    });
    const session = new McpSession(transport, { clientInfo: this.#options.clientInfo });
    await session.initialize();
    return session;
  }

  /** The connector's headers, and its bearer token from the secret store, never from the workspace. */
  async #headers(): Promise<Headers> {
    const headers = new Headers(this.#http.headers);
    const secretName = this.#config.secret;
    if (secretName === undefined) return headers;
    const token = await this.#context.secrets.get(secretName);
    if (token === null) throw new SecretNotSetError(this.id, secretName);
    headers.set("authorization", `Bearer ${token}`);
    return headers;
  }

  /** When the server forgot the session, the next call starts a new one. */
  #forget(error: unknown): never {
    if (error instanceof McpError && error.code === "session-expired") {
      this.#connecting = undefined;
    }
    throw error;
  }
}
