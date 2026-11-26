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
  readonly executionState?: { readonly monitor?: { readonly attemptCount?: number } | null } | null;
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

/** A task as the host's issue client returns it: only the fields the actions read. */
export interface IssueRecord {
  readonly id: string;
  readonly identifier?: string | null;
  readonly status: string;
  readonly assigneeAgentId?: string | null;
  readonly monitorNextCheckAt?: Date | string | null;
  readonly executionState?: { readonly monitor?: { readonly attemptCount?: number } | null } | null;
}

/** The change the plain issue update takes, as far as the actions use it. */
export interface IssuePatch {
  readonly status?: string;
  readonly assigneeAgentId?: string;
  readonly blockedByIssueIds?: string[];
}

/** Who a plain update is made for: the calling agent and its run. */
export interface IssueActor {
  readonly actorAgentId: string;
  readonly actorRunId: string;
}

/** A monitor as Paperclip's update route stores it. */
export interface MonitorPolicy {
  readonly nextCheckAt: string;
  readonly notes: string | null;
  readonly scheduledBy: "assignee";
  readonly kind: "external_service";
  readonly serviceName: string;
  readonly externalRef: string;
  readonly timeoutAt: string;
  readonly maxAttempts: number;
}

/** The change `issues.setDisposition` takes: the plain change plus the comment and the monitor. */
export interface DispositionPatch extends IssuePatch {
  readonly comment: string;
  readonly monitor?: MonitorPolicy | null;
}

/** `issues.setDisposition`'s answer: the route's status and body. */
export interface DispositionResult {
  readonly ok: boolean;
  readonly status: number;
  readonly body: unknown;
}

/** The host's issue client: the reads, a comment, a plain update and, on some hosts, `setDisposition`. */
export interface IssuesClient extends PaperclipTaskReads {
  createComment(
    issueId: string,
    body: string,
    companyId: string,
    options?: { readonly authorAgentId?: string },
  ): Promise<{ readonly id: string }>;
  update(
    issueId: string,
    patch: IssuePatch,
    companyId: string,
    actor?: IssueActor,
  ): Promise<IssueRecord>;
  /**
   * Halonic's server only (halonic-com/server#31): the change sent through
   * Paperclip's own update route as the calling run, with its disposition
   * guard. Another Paperclip has no such method.
   */
  setDisposition?(
    issueId: string,
    companyId: string,
    patch: DispositionPatch,
  ): Promise<DispositionResult>;
}

/** An agent as the host's agent list returns it. */
export interface AgentRecord {
  readonly id: string;
  readonly name: string;
  readonly urlKey: string;
  /** Its monthly budget in cents, as Paperclip's agent list gives it. */
  readonly budgetMonthlyCents?: number;
}

/** A project's budget as the host's project list gives it, when the project has one. */
export interface ProjectBudget {
  readonly amountCents: number;
  /** `calendar_month_utc` for a monthly budget; `lifetime` for one over the project's whole life. */
  readonly windowKind: string;
}

/** A project as the host's project list returns it: only the fields the actions read. */
export interface ProjectRecord {
  readonly id: string;
  readonly name: string;
  readonly urlKey: string;
  /** Its active budget, as Paperclip's project list gives it; null or missing when it has none. */
  readonly budget?: ProjectBudget | null;
}

/**
 * A board approval as the host's approval list returns it: only the fields
 * the actions read. Its payload is Paperclip's, so every field is checked
 * before use.
 */
export interface ApprovalRecord {
  readonly id: string;
  /** Such as `budget_override_required`. */
  readonly type: string;
  /** Such as `pending`. */
  readonly status: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * The plugin host's clients the runtime calls. A tool call may get its own
 * host, whose calls Paperclip scopes to that call (the worker client gives
 * one); without one, the tool uses the host it was registered on.
 */
export interface RuntimeHost {
  readonly tools: {
    register(
      name: string,
      declaration: ToolDeclaration,
      run: (params: unknown, runCtx: ToolRunContext, host?: RuntimeHost) => Promise<ToolResult>,
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
    }): Promise<readonly AgentRecord[]>;
  };
  readonly projects: {
    list(input: {
      readonly companyId: string;
      readonly limit?: number;
    }): Promise<readonly ProjectRecord[]>;
  };
  /** Reading board approvals. The SDK has no way to file one (HAL-20033). */
  readonly approvals: {
    list(input: {
      readonly companyId: string;
      readonly status?: string;
    }): Promise<readonly ApprovalRecord[]>;
  };
  readonly issues: IssuesClient;
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
  | "projects.read"
  | "approvals.read"
  | "plugin.state.read"
  | "plugin.state.write"
  | "metrics.write"
  | "http.outbound"
  | "secrets.read-ref"
  | "issues.read"
  | "issue.comments.read"
  | "issue.documents.read"
  | "issue.relations.read"
  | "events.subscribe"
  | "issue.comments.create"
  | "issues.update";

/** The capabilities that let an action change something; only a writing action may have them. */
export const writeCapabilities: readonly Capability[] = ["issue.comments.create", "issues.update"];
