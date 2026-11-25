/**
 * The part of Paperclip's plugin host the runtime uses, written down here so
 * the runtime doesn't depend on Paperclip's SDK. The names and shapes follow
 * the SDK (2026.1117.0), so the context Paperclip gives a plugin worker fits
 * them as it is.
 */

/** A scope key in plugin state. */
export interface StateKey {
  readonly scopeKind: "company";
  readonly scopeId: string;
  readonly namespace: string;
  readonly stateKey: string;
}

/** A secret reference as the plugin's settings hold it. */
export interface SecretRef {
  readonly type: "secret_ref";
  readonly secretId: string;
}

/** What a tool call gets back: content on success, `error` on failure. */
export interface ToolResult {
  readonly content?: string;
  readonly data?: unknown;
  readonly error?: string;
}

/** Who calls a tool, in which run and company. */
export interface ToolRunContext {
  readonly agentId: string;
  readonly runId: string;
  readonly companyId: string;
  readonly projectId: string;
}

/** One tool as the plugin's manifest declares it. */
export interface ToolDeclaration {
  readonly name: string;
  readonly displayName: string;
  readonly description: string;
  readonly parametersSchema: Readonly<Record<string, unknown>>;
}

/** The plugin host's clients the runtime calls. */
export interface RuntimeHost {
  readonly tools: {
    register(
      name: string,
      declaration: ToolDeclaration,
      run: (params: unknown, runCtx: ToolRunContext) => Promise<ToolResult>,
    ): void;
  };
  readonly agents: {
    get(
      agentId: string,
      companyId: string,
    ): Promise<{ readonly urlKey: string; readonly name: string } | null>;
  };
  readonly config: { get(companyId: string): Promise<Record<string, unknown>> };
  readonly secrets: {
    resolve(ref: SecretRef, options: { readonly companyId: string }): Promise<string>;
  };
  readonly http: { fetch(url: string, init?: RequestInit): Promise<Response> };
  readonly metrics: {
    write(name: string, value: number, tags?: Record<string, string>): Promise<void>;
  };
  readonly state: {
    get(key: StateKey): Promise<unknown>;
    set(key: StateKey, value: unknown): Promise<void>;
    delete(key: StateKey): Promise<void>;
  };
}

/**
 * The Paperclip capabilities a plugin needs, by the names Paperclip's
 * manifest uses. Only the ones the runtime and its actions ask for.
 */
export type Capability =
  | "agent.tools.register"
  | "agents.read"
  | "plugin.state.read"
  | "plugin.state.write"
  | "metrics.write"
  | "http.outbound"
  | "secrets.read-ref"
  | "issues.read"
  | "issue.comments.read"
  | "issue.documents.read";
