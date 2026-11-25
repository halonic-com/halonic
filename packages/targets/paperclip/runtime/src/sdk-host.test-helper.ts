import type { StateKey } from "./host.ts";
import { startWorker, type WorkerSetup } from "./worker-client.ts";

/**
 * Paperclip's side of the worker protocol for tests: the SDK's own test
 * harness holds the host's state, config, metrics and agents, and the SDK's
 * own protocol helpers write every message to the worker and read every
 * message from it. So a message our client writes that the SDK can't read
 * fails the test. Only test files may import the SDK (it is dev tooling), so
 * they pass it in; this file names just the parts it uses.
 */

type RpcId = string | number;

/** A JSON-RPC message, as the SDK's `parseMessage` reads it. */
interface Message {
  readonly id?: RpcId | null;
  readonly method?: string;
  readonly params?: unknown;
  readonly result?: unknown;
  readonly error?: { readonly code: number; readonly message: string };
}

/** The SDK's in-memory host, as `createTestHarness` makes it. */
export interface SdkHarness {
  readonly ctx: {
    readonly config: { get(companyId?: string): Promise<unknown> };
    readonly state: {
      get(key: StateKey): Promise<unknown>;
      set(key: StateKey, value: unknown): Promise<void>;
      delete(key: StateKey): Promise<void>;
    };
    readonly secrets: {
      resolve(
        ref: { type: "secret_ref"; secretId: string },
        options?: { companyId: string },
      ): Promise<string>;
    };
    readonly agents: {
      get(agentId: string, companyId: string): Promise<unknown>;
      list(input: { companyId: string; limit?: number }): Promise<unknown>;
    };
    readonly issues: {
      get(issueId: string, companyId: string): Promise<unknown>;
      listComments(issueId: string, companyId: string): Promise<unknown>;
      readonly relations: { get(issueId: string, companyId: string): Promise<unknown> };
      readonly documents: {
        list(issueId: string, companyId: string): Promise<unknown>;
        get(issueId: string, key: string, companyId: string): Promise<unknown>;
      };
    };
    readonly metrics: {
      write(name: string, value: number, tags?: Record<string, string>): Promise<void>;
    };
    readonly http: { fetch(url: string, init?: RequestInit): Promise<Response> };
  };
  readonly metrics: readonly unknown[];
  getState(key: StateKey): unknown;
  /** Seeds Paperclip's records, in the SDK's own `Agent`, `Issue` and `IssueComment` shapes. */
  seed(input: { agents?: never[]; issues?: never[]; issueComments?: never[] }): void;
}

/** What the host answers a task read with, or `undefined` when the call isn't one. */
function taskReadAnswer(harness: SdkHarness, request: Message): Promise<unknown> | undefined {
  const { issues } = harness.ctx;
  const { issueId, key, companyId } = request.params as {
    issueId: string;
    key: string;
    companyId: string;
  };
  switch (request.method) {
    case "issues.get":
      return issues.get(issueId, companyId);
    case "issues.listComments":
      return issues.listComments(issueId, companyId);
    case "issues.relations.get":
      return issues.relations.get(issueId, companyId);
    case "issues.documents.list":
      return issues.documents.list(issueId, companyId);
    case "issues.documents.get":
      return issues.documents.get(issueId, key, companyId);
    default:
      return undefined;
  }
}

/** The parts of `@paperclipai/plugin-sdk` the test host uses: its testing and protocol entries. */
export interface PluginSdk {
  createTestHarness(options: { manifest: unknown; config?: Record<string, unknown> }): SdkHarness;
  parseMessage(line: string): Message;
  isJsonRpcRequest(message: unknown): boolean;
  isJsonRpcResponse(message: unknown): boolean;
  createRequest(method: string, params: unknown): Message & { readonly id: RpcId };
  createSuccessResponse(id: RpcId, result: unknown): Message;
  createErrorResponse(id: RpcId, code: number, message: string): Message;
  serializeMessage(message: Message): string;
  readonly PLUGIN_RPC_ERROR_CODES: { readonly CAPABILITY_DENIED: number };
}

/** Lines into the worker, as the async stream its stdin would be. */
function lineQueue() {
  const waiting: ((line: IteratorResult<string>) => void)[] = [];
  const queued: string[] = [];
  let closed = false;
  const push = (line: string) => {
    const reader = waiting.shift();
    if (reader === undefined) queued.push(line);
    else reader({ value: line, done: false });
  };
  const close = () => {
    closed = true;
    for (const reader of waiting.splice(0)) reader({ value: undefined, done: true });
  };
  const input: AsyncIterable<string> = {
    [Symbol.asyncIterator]: () => ({
      next: () => {
        const line = queued.shift();
        if (line !== undefined) return Promise.resolve({ value: line, done: false });
        if (closed) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve) => waiting.push(resolve));
      },
    }),
  };
  return { input, push, close };
}

/** What the host does with one call from the worker, by the SDK harness's own clients. */
async function hostAnswer(harness: SdkHarness, request: Message): Promise<unknown> {
  const { ctx } = harness;
  const params = <T>() => request.params as T;
  switch (request.method) {
    case "config.get":
      return ctx.config.get(params<{ companyId: string }>().companyId);
    case "state.get":
      return ctx.state.get(params<StateKey>());
    case "state.set":
      return ctx.state.set(params<StateKey>(), params<{ value: unknown }>().value);
    case "state.delete":
      return ctx.state.delete(params<StateKey>());
    case "secrets.resolve": {
      const { secretRef, companyId } = params<{
        secretRef: { type: "secret_ref"; secretId: string };
        companyId: string;
      }>();
      return ctx.secrets.resolve(secretRef, { companyId });
    }
    case "agents.get": {
      const { agentId, companyId } = params<{ agentId: string; companyId: string }>();
      return ctx.agents.get(agentId, companyId);
    }
    case "events.subscribe":
      // Paperclip records the subscription and answers with nothing.
      return null;
    case "agents.list":
      return ctx.agents.list(params<{ companyId: string; limit?: number }>());
    case "metrics.write": {
      const { name, value, tags } = params<{
        name: string;
        value: number;
        tags?: Record<string, string>;
      }>();
      return ctx.metrics.write(name, value, tags);
    }
    case "http.fetch": {
      const { url, init } = params<{ url: string; init: RequestInit }>();
      const response = await ctx.http.fetch(url, init);
      const headers = Object.fromEntries(response.headers.entries());
      return {
        status: response.status,
        statusText: response.statusText,
        headers,
        body: await response.text(),
      };
    }
    default: {
      const answer = taskReadAnswer(harness, request);
      if (answer === undefined) throw new Error(`the test host has no ${String(request.method)}`);
      return answer;
    }
  }
}

/** The manifest of the invented `acme` plugin, with the given capabilities and one tool. */
export function acmeManifest(capabilities: readonly string[]) {
  return {
    id: "acme.workspace-tools",
    apiVersion: 1,
    version: "0.0.0",
    displayName: "Acme workspace tools",
    description: "Acme's tools, for tests.",
    author: "Acme",
    categories: ["automation"],
    capabilities,
    entrypoints: { worker: "worker.js" },
    tools: [{ name: "probe", displayName: "Probe", description: "Probes.", parametersSchema: {} }],
  };
}

/** A worker on our client, wired to a host on the SDK's harness. */
export function sdkHost(
  sdk: PluginSdk,
  options: {
    readonly capabilities: readonly string[];
    readonly setup: WorkerSetup;
    readonly config?: Record<string, unknown>;
    /** Host methods that never answer, to make the worker wait. */
    readonly silent?: readonly string[];
    readonly timeoutMs?: number;
  },
) {
  const manifest = acmeManifest(options.capabilities);
  const harness = sdk.createTestHarness({ manifest, config: options.config ?? {} });
  const lines = lineQueue();
  const answers = new Map<RpcId, (response: Message) => void>();
  /** Every message the worker wrote, as the SDK parsed it. */
  const written: unknown[] = [];

  const serve = async (request: Message & { readonly id: RpcId }) => {
    if (options.silent?.includes(String(request.method))) return;
    try {
      const result = await hostAnswer(harness, request);
      lines.push(sdk.serializeMessage(sdk.createSuccessResponse(request.id, result ?? null)));
    } catch (error) {
      const code = sdk.PLUGIN_RPC_ERROR_CODES.CAPABILITY_DENIED;
      lines.push(
        sdk.serializeMessage(sdk.createErrorResponse(request.id, code, (error as Error).message)),
      );
    }
  };
  const write = (line: string) => {
    const message = sdk.parseMessage(line);
    written.push(message);
    const id = message.id ?? null;
    if (sdk.isJsonRpcResponse(message) && id !== null) answers.get(id)?.(message);
    else if (sdk.isJsonRpcRequest(message) && id !== null) void serve({ ...message, id });
  };
  const worker = startWorker({ input: lines.input, write }, options.setup, {
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });

  /** Sends Paperclip's request and resolves with the worker's answer. */
  const request = (method: string, params: unknown, extra: Record<string, unknown> = {}) => {
    const message = { ...sdk.createRequest(method, params), ...extra };
    const answered = new Promise<Message>((resolve) => answers.set(message.id, resolve));
    lines.push(sdk.serializeMessage(message));
    return answered;
  };
  const initialize = (apiVersion = 1) =>
    request("initialize", {
      manifest,
      config: options.config ?? {},
      instanceInfo: { instanceId: "acme-instance", hostVersion: "2026.1117.0" },
      apiVersion,
    });
  const executeTool = (parameters: unknown, extra: Record<string, unknown> = {}) =>
    request(
      "executeTool",
      {
        toolName: "probe",
        parameters,
        runContext: { agentId: "agent-mateo", runId: "run-1", companyId: "acme", projectId: "" },
      },
      extra,
    );
  return {
    harness,
    request,
    initialize,
    executeTool,
    written,
    send: lines.push,
    close: lines.close,
    worker,
  };
}
