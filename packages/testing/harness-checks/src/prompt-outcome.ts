import type { SandboxCommand } from "@halonicjs/ports";
import {
  type BridgeSandbox,
  type BridgeSandboxOptions,
  type CheckedRun,
  openBridgeSandbox,
} from "./bridge-sandbox.ts";
import type { TappedRequest } from "./header-tap.ts";

/** Whether a harness says someone is signed in; `unknown` when its answer can't be read. */
export type SignedIn = "yes" | "no" | "unknown";

/** How a prompt ended: answered, a sign-in problem the harness printed, stopped by the check, or another failure. */
export type PromptResult = "answered" | "signed-out" | "sign-in-expired" | "timed-out" | "failed";

/** How one prompt through the bridge went, in facts a report may print. */
export interface PromptOutcome {
  result: PromptResult;
  exitCode: number | null;
  /** What reached the bridge, by path and header name. */
  requests: TappedRequest[];
  /** The `host:port` of each connection the sandbox refused, each once. */
  denied: string[];
  /** How many model calls the bridge answered and recorded. */
  modelCalls: number;
}

/**
 * The prompt again with a sign-in that has expired, so the harness
 * refreshes first. `not-forced` when the check wasn't asked to;
 * `not-possible` when the sign-in can't be expired safely.
 */
export type RefreshOutcome = PromptOutcome | "not-forced" | "not-possible";

/** Opens the bridge and the sandbox for one check; the real ones unless a test gives others. */
export type OpenSandbox = (options: BridgeSandboxOptions) => Promise<BridgeSandbox>;

/** Opens a bridge and a sandbox, runs `use`, and closes both. */
export async function withSandbox<T>(
  options: BridgeSandboxOptions,
  use: (sandbox: BridgeSandbox) => Promise<T>,
  open: OpenSandbox = openBridgeSandbox,
): Promise<T> {
  const sandbox = await open(options);
  try {
    return await use(sandbox);
  } finally {
    await sandbox.close();
  }
}

/**
 * Runs the prompt in the sandbox and reports only what it caused: the
 * requests, refusals and model calls since it started, not those of the
 * quick questions before it. `resultOf` reads how it ended from the run.
 */
export async function promptOutcome(
  sandbox: BridgeSandbox,
  prompt: SandboxCommand,
  timeoutMs: number,
  resultOf: (run: CheckedRun) => PromptResult,
): Promise<PromptOutcome> {
  const before = {
    requests: sandbox.requests.length,
    denied: sandbox.denied.length,
    modelCalls: sandbox.modelCalls,
  };
  const run = await sandbox.run(prompt, timeoutMs);
  return {
    result: resultOf(run),
    exitCode: run.exit.code,
    requests: sandbox.requests.slice(before.requests),
    denied: [...new Set(sandbox.denied.slice(before.denied))],
    modelCalls: sandbox.modelCalls - before.modelCalls,
  };
}
