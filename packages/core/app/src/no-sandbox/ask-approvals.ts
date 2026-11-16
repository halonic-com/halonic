// The approvals of a run in "no sandbox" ask mode (HAL-5397, N1a, N6, N7,
// N8): the harness's own tool calls pass through the ask policy, and a
// person answers what it doesn't let through.

import type {
  BridgeApprovalDecision,
  BridgeApprovalRequest,
  BridgeApprovals,
} from "@halonicjs/ports";
import type { SaveTimers } from "../save-scheduler.ts";
import {
  type AskPolicyOptions,
  type AskToolCall,
  type AskVerdict,
  askPolicy,
} from "./ask-policy.ts";

/** A command longer than this asks with a warning, because a card can't show it all at a glance. */
export const longCommandLength = 2000;

/** How long a person has to answer before the answer is no: five minutes. */
export const defaultAnswerTimeLimitMs = 5 * 60 * 1000;

/** What the card tells the person about a command: it can start other programs, and "yes" covers this call only. */
export const commandCardNote =
  "This command can run other programs. Your answer covers this one call only.";

export interface AskApprovalsOptions extends AskPolicyOptions {
  /** Asks the person; the run's own approvals. */
  readonly inner: BridgeApprovals;
  /**
   * `false` when nobody can answer, such as a command line run without a
   * terminal. Then ask mode isn't started: {@link askModeApprovals} throws.
   */
  readonly canAsk: boolean;
  /** Milliseconds before no answer means no. Defaults to {@link defaultAnswerTimeLimitMs}. */
  readonly answerTimeLimitMs?: number;
  /** The clock the time limit runs on: `setTimeout` and `clearTimeout`, or a test's own. */
  readonly timers: SaveTimers;
  /** Makes the signal that withdraws a question: `() => new AbortController()`. */
  readonly newAbortController: () => { readonly signal: AbortSignal; abort(): void };
}

/** Thrown when ask mode can't start because nobody can be asked (N8). */
export class CannotAskError extends Error {
  readonly code = "harness-cant-ask";
  constructor() {
    super(
      "No sandbox needs a person to answer every command, and this run has no way to ask, so it was not started.",
    );
    this.name = "CannotAskError";
  }
}

/** Control characters but tab and line breaks, and the characters that hide or reorder text. */
function needsEscape(code: number): boolean {
  if (code === 0x09 || code === 0x0a) return false;
  return (
    code <= 0x1f ||
    (code >= 0x7f && code <= 0x9f) ||
    code === 0x061c ||
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x2028 && code <= 0x202e) ||
    (code >= 0x2060 && code <= 0x2069) ||
    code === 0xfeff
  );
}

/**
 * The command as a person reads it: every control and bidirectional
 * character written out as `\u{…}`, so one can't hide or reorder text.
 * Line breaks and tabs stay; nothing is cut off.
 */
export function escapeForCard(text: string): string {
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    out += needsEscape(code) ? `\\u{${code.toString(16).padStart(4, "0")}}` : char;
  }
  return out;
}

const readTools = new Set(["Read", "NotebookRead", "Glob", "Grep"]);
const editTools = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

function pathOf(args: unknown): string | null {
  if (typeof args !== "object" || args === null) return null;
  const record = args as Record<string, unknown>;
  for (const key of ["file_path", "notebook_path", "path"]) {
    const value = record[key];
    if (typeof value === "string" && value !== "") return value;
  }
  return null;
}

/** Reads Claude Code's own tool call as the policy's kinds. Anything it can't read is `other`, which asks. */
export function toAskToolCall(tool: string, args: unknown): AskToolCall {
  if (tool === "Bash") {
    const command =
      typeof args === "object" && args !== null
        ? (args as Record<string, unknown>)["command"]
        : null;
    return typeof command === "string" ? { kind: "shell", command } : { kind: "other", name: tool };
  }
  const path = pathOf(args);
  if (path !== null && readTools.has(tool)) return { kind: "read", path };
  if (path !== null && editTools.has(tool)) return { kind: "edit", path };
  return { kind: "other", name: tool };
}

function cardArgs(call: AskToolCall, args: unknown): unknown {
  if (call.kind !== "shell") return args;
  return {
    command: escapeForCard(call.command),
    note: commandCardNote,
    ...(call.command.length > longCommandLength
      ? { warning: `This command is ${call.command.length} characters long. Read all of it.` }
      : {}),
  };
}

const refusedWords: Record<string, string> = {
  "device-path": "a device path",
  "network-path": "a network path",
  "alternate-stream": "an alternate data stream",
};

/**
 * Wraps a run's approvals for ask mode (requirements `app.ask-approvals`). A
 * call the policy allows runs without asking; one it refuses is rejected
 * without asking; every other call goes to the person with the full command
 * written out, and no answer within the time limit is a no. It remembers
 * nothing, so every call asks again.
 *
 * @throws CannotAskError when `canAsk` is `false`
 */
export function askModeApprovals(options: AskApprovalsOptions): BridgeApprovals {
  if (!options.canAsk) throw new CannotAskError();
  const limit = options.answerTimeLimitMs ?? defaultAnswerTimeLimitMs;
  return {
    async request(request, { signal }): Promise<BridgeApprovalDecision> {
      const call = toAskToolCall(request.tool, request.args);
      let verdict: AskVerdict;
      try {
        verdict = await askPolicy(call, options);
      } catch {
        verdict = { decision: "ask", reason: "unresolved" };
      }
      if (verdict.decision === "allow") return { approved: true };
      if (verdict.decision === "refuse") {
        return {
          approved: false,
          comment: `Refused: this is ${refusedWords[verdict.reason] ?? "a path that is never allowed"}.`,
        };
      }
      return askWithin(options, { ...request, args: cardArgs(call, request.args) }, signal, limit);
    },
  };
}

async function askWithin(
  options: AskApprovalsOptions,
  request: BridgeApprovalRequest,
  signal: AbortSignal,
  limitMs: number,
): Promise<BridgeApprovalDecision> {
  const own = options.newAbortController();
  const stop = (): void => own.abort();
  signal.addEventListener("abort", stop, { once: true });
  let timer: unknown;
  const timedOut = new Promise<BridgeApprovalDecision>((resolve) => {
    timer = options.timers.set(() => {
      resolve({ approved: false, comment: "Nobody answered in time, so the answer is no." });
      own.abort(); // after the answer is set: withdrawing makes the question reject
    }, limitMs);
  });
  const answer = options.inner.request(request, { signal: own.signal });
  answer.catch(() => undefined); // withdrawn by the limit: the race has its answer already
  try {
    return await Promise.race([answer, timedOut]);
  } finally {
    options.timers.clear(timer);
    signal.removeEventListener("abort", stop);
  }
}
