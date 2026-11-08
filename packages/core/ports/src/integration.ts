import type { ConnectorTool, ToolRisk } from "./connector-client.ts";
import type { HttpClient } from "./http-client.ts";
import type { KnowledgeProvider } from "./knowledge-provider.ts";
import type { LlmProvider, ProviderConfig } from "./llm-provider.ts";
import type { TokenStore } from "./token-store.ts";

/**
 * Version of the {@link Integration} and {@link IntegrationHost} ports. A
 * breaking change bumps it and comes with an ADR. An integration's permission
 * sheet names the version it was built against (`kit`), and the loader
 * refuses one built against another version.
 */
export const integrationVersion = 1;

/**
 * A tool an integration offers: the {@link ConnectorTool} shape, with its
 * `risk` required. The permission sheet lists the same tools with the same
 * `risk` and `untrusted`, and the conformance suite fails when they differ.
 */
export interface IntegrationTool extends ConnectorTool {
  risk: ToolRisk;
}

/**
 * Puts a configured secret into one request. The integration names the
 * secret; the host looks up the value and places it, and only when the
 * permission sheet allows that secret to go to the request's host. The
 * integration never sees the value, so it can't put it in a URL, a tool
 * result, an error or a log.
 */
export type SecretPlacement =
  /** `Authorization: Bearer <value>`. */
  | { secret: string; as: "bearer" }
  /** `<header>: <prefix><value>`, such as `x-api-key`. */
  | { secret: string; as: "header"; header: string; prefix?: string }
  /** A field in a form body (`application/x-www-form-urlencoded`), such as an OAuth `client_secret`. */
  | { secret: string; as: "form"; field: string };

/** A request as an integration sends it: a Web `RequestInit`, plus where to put a secret. */
export interface IntegrationRequestInit extends RequestInit {
  /** The secrets to place in this request. Each must be declared and allowed for the host. */
  auth?: SecretPlacement | readonly SecretPlacement[];
}

/**
 * The only way an integration reaches the network. It sends only to the
 * hosts the permission sheet declares (exact host, `https`), checks every
 * redirect hop the same way, and places secrets for the integration.
 *
 * @example
 * const response = await host.http.fetch("https://api.example.com/v1/forecast?city=Ghent", {
 *   auth: { secret: "example-key", as: "header", header: "x-api-key" },
 *   signal,
 * });
 */
export interface IntegrationHttpClient extends HttpClient {
  /**
   * Sends one request. An HTTP error status still resolves; check `ok`.
   *
   * @throws when the host, the scheme or a redirect isn't allowed, a secret
   *   isn't declared or isn't allowed for the host, the network fails, the
   *   request times out or is aborted, or the response is too large
   */
  fetch(url: string, init?: IntegrationRequestInit): Promise<Response>;
}

/**
 * What an integration is given, and all it is given. There is no raw
 * `HttpClient`, no `Secrets` and no file system: an integration reaches the
 * outside world only through these.
 */
export interface IntegrationHost {
  /** Outbound HTTP, limited to the declared hosts and secrets. */
  readonly http: IntegrationHttpClient;
  /**
   * Tokens this integration writes itself, such as a refresh token. Only the
   * names its permission sheet declares, and only its own: two integrations
   * with a token of the same name never see each other's.
   */
  readonly tokens: TokenStore;
  /**
   * The settings the workspace gives this integration, such as a `baseUrl`
   * or an account name. Never a secret value.
   */
  readonly settings: Readonly<Record<string, unknown>>;
}

/**
 * One integration connected through its host. Created by
 * {@link Integration.connect}; the host closes it when the workspace no
 * longer needs it.
 */
export interface IntegrationConnection {
  /**
   * Calls one of the integration's tools and returns its text result.
   *
   * @throws when the tool fails, the host refuses a request or `signal` aborts the call
   */
  callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<string>;
  /**
   * The tools offered now, when they can change while connected (an MCP
   * server). Without it the declared `tools` are the list. The host treats a
   * tool it finds here but not in the declaration as `risk: "write"` unless
   * the workspace sets a lower one.
   */
  listTools?(): Promise<IntegrationTool[]>;
  /** Builds a model provider, for an integration whose sheet `provides` `llm`. */
  createLlmProvider?(config: ProviderConfig): LlmProvider;
  /** Builds a knowledge source, for an integration whose sheet `provides` `knowledge`. */
  createKnowledgeProvider?(source: {
    id: string;
    config: Record<string, unknown>;
  }): KnowledgeProvider;
  /** Releases what the connection holds. Safe to call twice. */
  close(): Promise<void>;
}

/**
 * An integration as its package exports it: what it is, which tools it
 * offers, and how to connect it. Its permission sheet (`integration.yaml`)
 * declares the same name, version and tools, plus the hosts, secrets and
 * tokens it may use.
 *
 * @example
 * export const weather: Integration = {
 *   name: "weather",
 *   version: "1.0.0",
 *   tools: [{ name: "forecast", description: "…", parameters: { type: "object" }, risk: "read", untrusted: true }],
 *   connect: (host) => ({
 *     callTool: async (_name, args, signal) => {
 *       const response = await host.http.fetch(`https://api.example.com/v1/forecast?city=${encodeURIComponent(String(args["city"]))}`, { signal });
 *       return await response.text();
 *     },
 *     close: async () => {},
 *   }),
 * };
 */
export interface Integration {
  /** The integration's name: lower-case words joined by `-`. The sheet's `id`. */
  readonly name: string;
  /** Its version, `major.minor.patch`. The sheet's `version`. */
  readonly version: string;
  /** The tools it offers. Empty for an integration that only provides a model or knowledge. */
  readonly tools: readonly IntegrationTool[];
  /** Connects through the host. Must not send a request before the first call. */
  connect(host: IntegrationHost): IntegrationConnection;
}
