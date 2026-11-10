import { isPlainObject } from "@halonicjs/std";
import type { AppServerMessage, RequestId } from "./app-server-client.ts";

/**
 * The requests Codex sends when it wants a person's OK, with the tool
 * Halonic names in `approval.requested`: the same names its `tool.called`
 * events use.
 */
const approvalTools: Readonly<Record<string, string>> = {
  "item/commandExecution/requestApproval": "shell",
  "item/fileChange/requestApproval": "apply_patch",
};

/** A request in which Codex asks a person for an OK before it runs a command or changes files. */
export interface CodexApprovalRequest {
  /** The thread that asks: the task agent's or a subagent's. */
  threadId: string;
  /** The item the OK is for; its `tool.called` has usually been reported already. */
  itemId: string;
  /** The id a person's decision names. */
  callId: string;
  /** The tool, as the harness names it: `shell` or `apply_patch`. */
  tool: string;
  /** What the request says about the call: the command and its folder, for a command. */
  args: Record<string, unknown>;
}

/** Codex's answer to an approval request: go ahead, or don't, and let the agent go on. */
export type CodexApprovalAnswer = { decision: "accept" | "decline" };

/**
 * The approval requests Codex has sent and no one has decided on yet
 * (requirement `harness-codex.approvals`). Codex 0.166.0 asks for an OK
 * when a rule in its settings says a command needs one; with its own sandbox
 * off, it asks for nothing else.
 *
 * @example
 * const request = approvals.add(message);
 * if (request !== undefined) queue.push(...reader.approvalRequested(request));
 * // later, when a person decides:
 * const { id, result } = approvals.answer(input.callId, input.approved);
 * await client.respond(id, { result });
 */
export class PendingApprovals {
  /** The JSON-RPC id of each waiting request, by the call id a decision names. */
  readonly #waiting = new Map<string, RequestId>();

  /**
   * Keeps `message` when it is an approval request.
   *
   * @returns the request, or `undefined` when the message isn't one
   */
  add(message: AppServerMessage): CodexApprovalRequest | undefined {
    if (message.kind !== "request") return undefined;
    const tool = approvalTools[message.method];
    const { params } = message;
    if (tool === undefined || !isPlainObject(params)) return undefined;
    const { threadId, itemId, approvalId } = params;
    if (typeof threadId !== "string" || typeof itemId !== "string") return undefined;
    // One command can ask more than once; each request then has an id of its own.
    const callId = typeof approvalId === "string" ? approvalId : itemId;
    this.#waiting.set(callId, message.id);
    return { threadId, itemId, callId, tool, args: argsOf(tool, params) };
  }

  /**
   * The answer to the request with `callId`, which then no longer waits.
   *
   * @throws Error when no request with that call id is waiting
   */
  answer(callId: string, approved: boolean): { id: RequestId; result: CodexApprovalAnswer } {
    const id = this.#waiting.get(callId);
    if (id === undefined) throw new Error(`No approval with call id "${callId}" is waiting.`);
    this.#waiting.delete(callId);
    return { id, result: { decision: approved ? "accept" : "decline" } };
  }

  /**
   * Forgets the request with JSON-RPC id `id`: Codex sends
   * `serverRequest/resolved` when a request no longer waits, such as when
   * its turn was interrupted.
   */
  forget(id: RequestId): void {
    for (const [callId, waiting] of this.#waiting) {
      if (waiting === id) this.#waiting.delete(callId);
    }
  }
}

/** The arguments the request itself gives: the command and folder of a command; nothing for a file change, whose item has the changes. */
function argsOf(tool: string, params: Record<string, unknown>): Record<string, unknown> {
  if (tool !== "shell") return {};
  const { command, cwd } = params;
  return {
    command: typeof command === "string" ? command : "",
    cwd: typeof cwd === "string" ? cwd : "",
  };
}
