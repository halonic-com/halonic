import type { Capability } from "./host.ts";
import { type Frame, RpcError, type RpcId, rpcErrors } from "./worker-protocol.ts";

/**
 * The worker's calls back to Paperclip: each one only when the plugin's
 * manifest declares the capability it needs, each with a timeout, and each
 * settled by Paperclip's answer with the same id. A call's params never go
 * into an error, because they may hold a secret.
 */

/** The capability each call back to Paperclip needs; `config.get` needs none. */
const callCapability: Readonly<Record<string, Capability | undefined>> = {
  "state.get": "plugin.state.read",
  "state.set": "plugin.state.write",
  "state.delete": "plugin.state.write",
  "secrets.resolve": "secrets.read-ref",
  "http.fetch": "http.outbound",
  "agents.get": "agents.read",
  "agents.list": "agents.read",
  "projects.list": "projects.read",
  "issues.get": "issues.read",
  "issues.listComments": "issue.comments.read",
  "issues.createComment": "issue.comments.create",
  "issues.update": "issues.update",
  "issues.relations.get": "issue.relations.read",
  "issues.documents.list": "issue.documents.read",
  "issues.documents.get": "issue.documents.read",
  "metrics.write": "metrics.write",
  "events.subscribe": "events.subscribe",
};

/** Paperclip's answer to one call: a result or an error. */
type Answer = Extract<Frame, { kind: "result" | "error" }>;

/** One call back to Paperclip, as the runtime's host makes it. */
export interface HostCall {
  readonly method: string;
  readonly params: unknown;
  /** The invocation Paperclip started the tool call with; Paperclip scopes the call by it. */
  readonly invocationId?: string | undefined;
  /** Gives up on the call early, as `fetch`'s signal does. */
  readonly signal?: AbortSignal | undefined;
}

/** The worker's side of its calls back to Paperclip. */
export class HostLink {
  readonly #send: (message: Record<string, unknown>) => void;
  readonly #timeoutMs: number;
  readonly #pending = new Map<RpcId, (answer: Answer) => void>();
  #capabilities: ReadonlySet<string> = new Set();
  #nextId = 1;

  constructor(send: (message: Record<string, unknown>) => void, timeoutMs: number) {
    this.#send = send;
    this.#timeoutMs = timeoutMs;
  }

  /** Sets the capabilities the plugin's manifest declares; calls needing any other are refused. */
  allow(capabilities: readonly string[]): void {
    this.#capabilities = new Set(capabilities);
  }

  /** Calls Paperclip and resolves with its result, or rejects with its error, a refusal or a timeout. */
  call({ method, params, invocationId, signal }: HostCall): Promise<unknown> {
    const needed = callCapability[method];
    if (needed !== undefined && !this.#capabilities.has(needed)) {
      const why = `the plugin's manifest doesn't declare ${needed}, so the worker doesn't call ${method}.`;
      return Promise.reject(new RpcError(rpcErrors.capabilityDenied, why));
    }
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const settle = (outcome: () => void) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", aborted);
        this.#pending.delete(id);
        outcome();
      };
      const aborted = () => settle(() => reject(signal?.reason));
      const timer = setTimeout(() => {
        const why = `Paperclip didn't answer ${method} within ${this.#timeoutMs / 1000} s.`;
        settle(() => reject(new RpcError(rpcErrors.timeout, why)));
      }, this.#timeoutMs);
      signal?.addEventListener("abort", aborted);
      this.#pending.set(id, (answer) =>
        settle(() =>
          answer.kind === "result"
            ? resolve(answer.result)
            : reject(new RpcError(answer.error.code, `${method}: ${answer.error.message}`)),
        ),
      );
      const echo = invocationId === undefined ? {} : { paperclipInvocationId: invocationId };
      this.#send({ id, method, params, ...echo });
    });
  }

  /** Settles the call Paperclip answered; an answer to no open call is ignored. */
  receive(answer: Answer): void {
    this.#pending.get(answer.id)?.(answer);
  }

  /** Fails every open call, when the worker stops. */
  stop(): void {
    for (const settle of this.#pending.values()) {
      settle({
        kind: "error",
        id: 0,
        error: { code: rpcErrors.workerError, message: "the worker stopped." },
      });
    }
  }
}
