// An agent whose file says `asks: in-sandbox` gets the ask policy's
// in-sandbox mode around its bridge's approvals (requirement
// `harness-host.sandboxed-asks`, HAL-14992). The host only wires it in: the
// rules are `inSandboxApprovals` in `core/app`, the fence state is the
// session's own proof the engine hands over, and the paths are resolved by
// the caller's own resolver, so this layer needs no file system.

import { inSandboxApprovals, type PathResolver } from "@halonicjs/app";
import type { HarnessAgent } from "@halonicjs/engine";
import type { BridgeApprovals, BridgeRecorder, SandboxSession } from "@halonicjs/ports";

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
 * log as `harness.allowed` first. The session is this bridge's own, so one
 * run's fence never answers for another's.
 */
export function sandboxedAsks(
  agent: Pick<HarnessAgent, "agentId" | "harness" | "file">,
  input: SandboxedAsksInput,
): SandboxedAsks {
  let session: SandboxSession | undefined;
  const sessionOpened = (opened: SandboxSession) => {
    session = opened;
  };
  const asksInSandbox = agent.harness === "claude-code" && agent.file.asks === "in-sandbox";
  const { inner, recorder, paths, failed } = input;
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
  const approvals = inSandboxApprovals({
    inner,
    session: () => session,
    resolve,
    windows: paths.windows,
    record: async ({ tool, detail }) => {
      try {
        await recorder.record({
          type: "harness.allowed",
          agent: agent.agentId,
          tool,
          detail,
          rule: "asks-in-sandbox",
        });
      } catch (error) {
        failed({
          kind: "asks-record",
          message: `The run log couldn't record ${tool} under the agent's asks: in-sandbox, so the call went to its approvals: ${messageOf(error)}`,
        });
        throw error;
      }
    },
  });
  return { approvals, sessionOpened };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
