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

/** A task as the SDK's `issues.get` gives it: only the fields the runtime reads. */
export interface PaperclipTask {
  readonly id: string;
  readonly identifier: string | null;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
  readonly assigneeAgentId: string | null;
  readonly assigneeUserId: string | null;
  readonly parentId: string | null;
  readonly description: string | null;
  readonly monitorNextCheckAt?: Date | string | null;
}

/** Another task as the SDK's `issues.relations.get` names it. */
export interface PaperclipTaskSummary {
  readonly id: string;
  readonly identifier: string | null;
  readonly status: string;
}

/** A task's comment as the SDK's `issues.listComments` gives it. */
export interface PaperclipComment {
  readonly id: string;
  readonly authorAgentId: string | null;
  readonly authorUserId: string | null;
  readonly createdAt: Date | string;
  readonly body: string;
}

/** A task's document as the SDK's `issues.documents.list` lists it. */
export interface PaperclipDocumentSummary {
  readonly key: string;
  readonly title: string | null;
  readonly updatedAt: Date | string;
}

/** The SDK's read clients for tasks, their comments, blockers and documents. Read-only. */
export interface PaperclipTaskReads {
  get(issueId: string, companyId: string): Promise<PaperclipTask | null>;
  listComments(issueId: string, companyId: string): Promise<readonly PaperclipComment[]>;
  readonly relations: {
    get(
      issueId: string,
      companyId: string,
    ): Promise<{ readonly blockedBy: readonly PaperclipTaskSummary[] }>;
  };
  readonly documents: {
    list(issueId: string, companyId: string): Promise<readonly PaperclipDocumentSummary[]>;
    get(
      issueId: string,
      key: string,
      companyId: string,
    ): Promise<{ readonly key: string; readonly body: string } | null>;
  };
}

/** A Paperclip event as the SDK's `events.on` delivers it: only the fields the runtime reads. */
export interface PaperclipEvent {
  readonly eventType: string;
  readonly occurredAt: string;
  readonly actorId?: string;
  readonly entityId?: string;
  readonly companyId: string;
  readonly payload: unknown;
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
    list(input: {
      readonly companyId: string;
      readonly limit?: number;
    }): Promise<readonly { readonly id: string; readonly urlKey: string; readonly name: string }[]>;
  };
  readonly issues: PaperclipTaskReads;
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
  readonly events: {
    on(name: "agent.run.failed", fn: (event: PaperclipEvent) => Promise<void>): () => void;
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
  | "issue.documents.read"
  | "issue.relations.read"
  | "events.subscribe";
