// An agent whose file says `asks: in-sandbox` gets the ask policy's
// in-sandbox mode around its bridge's approvals (requirement
// `harness-host.sandboxed-asks`, HAL-14992). The host only wires it in: the
// rules are `inSandboxApprovals` in `core/app`, the fence state is the
// session's own proof the engine hands over, and the paths are resolved by
// the caller's own resolver, so this layer needs no file system.

import { type InSandboxAllowed, inSandboxApprovals, type PathResolver } from "@halonicjs/app";
import type { HarnessAgent } from "@halonicjs/engine";
import type { BridgeApprovals, BridgeRecorder, SandboxSession } from "@halonicjs/ports";
import { type Clock, systemClock } from "@halonicjs/std";

/** How the host's computer resolves the paths a program names. */
export interface SandboxedAsksPaths {
  /** Follows links and short names; the CLI's and the agent host's own, on Node. */
  readonly resolve: PathResolver;
  /** Whether the computer is Windows, for its drive, UNC and stream paths. */
  readonly windows: boolean;
}

/** What {@link sandboxedAsks} wraps, writes to and reports to. */
export interface SandboxedAsksInput {
  /** The services' own approvals, which get every call the policy doesn't let through. */
  readonly inner: BridgeApprovals;
  /** The run log of this one run, for `harness.allowed`. */
  readonly recorder: BridgeRecorder;
  /** The host's resolver; without it, nothing is let through. */
  readonly paths: SandboxedAsksPaths | undefined;
  /**
   * Hears why a call went to the run's approvals when a path couldn't be
   * resolved or the run log couldn't take the call; it must not throw.
   */
  readonly failed: (failure: { kind: string; message: string }) => void;
  /**
   * Removes the values of the secrets the bridge read from the path or
   * command a `harness.allowed` names, as from a `bridge.failed`'s message;
   * none by default.
   */
  readonly scrub?: (text: string) => string;
  /** Times each ask for a let-through call's `waitedMs`; the machine's clock by default. */
  readonly clock?: Clock;
}

/**
 * The agent {@link sandboxedAsks} reads: its id, its harness (`undefined`
 * when the caller wasn't told it) and its file's `asks`.
 */
export interface SandboxedAsksAgent {
  readonly agentId: HarnessAgent["agentId"];
  readonly harness: HarnessAgent["harness"] | undefined;
  readonly file: Pick<HarnessAgent["file"], "asks">;
}

/** One bridge's approvals, and the hook the engine gives its session to. */
export interface SandboxedAsks {
  readonly approvals: BridgeApprovals;
  readonly sessionOpened: (session: SandboxSession) => void;
}

/**
 * The bridge's approvals for `agent`: the in-sandbox mode around the inner
 * approvals for a Claude Code agent whose file, as the run kept it, says
 * `asks: in-sandbox` and a host that resolves paths; the inner approvals
 * themselves for every other agent. A call let through is written to the run
 * log as `harness.allowed` first, with how long Halonic took to answer it.
 * The session is this bridge's own, so one run's fence never answers for
 * another's.
 */
export function sandboxedAsks(agent: SandboxedAsksAgent, input: SandboxedAsksInput): SandboxedAsks {
  let session: SandboxSession | undefined;
  const sessionOpened = (opened: SandboxSession) => {
    session = opened;
  };
  const asksInSandbox = agent.harness === "claude-code" && agent.file.asks === "in-sandbox";
  const { inner, recorder, paths, failed } = input;
  const scrub = input.scrub ?? ((text: string) => text);
  if (!asksInSandbox || paths === undefined) return { approvals: inner, sessionOpened };
  // The policy fails closed on a throw without saying why, so the cause is
  // told here before it goes on: the run log then shows why a person was asked.
  const resolve: PathResolver = async (path) => {
    try {
      return await paths.resolve(path);
    } catch (error) {
      failed({
        kind: "asks-path",
        message: `Couldn't resolve ${path} for the agent's asks: in-sandbox, so the call went to its approvals: ${messageOf(error)}`,
      });
      throw error;
    }
  };
  const record = async ({ tool, detail }: InSandboxAllowed, waitedMs: number) => {
    try {
      await recorder.record({
        type: "harness.allowed",
        agent: agent.agentId,
        tool,
        detail: scrub(detail),
        rule: "asks-in-sandbox",
        waitedMs,
      });
    } catch (error) {
      failed({
        kind: "asks-record",
        message: `The run log couldn't record ${tool} under the agent's asks: in-sandbox, so the call went to its approvals: ${messageOf(error)}`,
      });
      throw error;
    }
  };
  const clock = input.clock ?? systemClock;
  const approvals: BridgeApprovals = {
    // The policy is made for each ask, so its `record` knows when that ask
    // came in, even while other asks of the same bridge are still resolving
    // paths. It keeps nothing between calls, so this costs one small object.
    request(request, context) {
      const askedAt = clock.now().getTime();
      return inSandboxApprovals({
        inner,
        session: () => session,
        resolve,
        windows: paths.windows,
        record: (allowed) => record(allowed, millisecondsSince(askedAt, clock)),
      }).request(request, context);
    },
  };
  return { approvals, sessionOpened };
}

/** Whole milliseconds since `start`; never below 0, should the machine's clock be set back. */
function millisecondsSince(start: number, clock: Clock): number {
  return Math.max(0, Math.round(clock.now().getTime() - start));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
