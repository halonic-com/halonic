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

/** One bridge's approvals, and the hook the engine gives its session to. */
export interface SandboxedAsks {
  readonly approvals: BridgeApprovals;
  readonly sessionOpened: (session: SandboxSession) => void;
}

/**
 * The bridge's approvals for `agent`: the in-sandbox mode around `inner` for
 * a Claude Code agent whose file, as the run kept it, says `asks: in-sandbox`
 * and a host that resolves paths; `inner` itself for every other agent. A
 * call let through is written to the run log as `harness.allowed` first.
 */
export function sandboxedAsks(
  agent: Pick<HarnessAgent, "agentId" | "harness" | "file">,
  inner: BridgeApprovals,
  recorder: BridgeRecorder,
  paths: SandboxedAsksPaths | undefined,
): SandboxedAsks {
  let session: SandboxSession | undefined;
  const sessionOpened = (opened: SandboxSession) => {
    session = opened;
  };
  const asksInSandbox = agent.harness === "claude-code" && agent.file.asks === "in-sandbox";
  if (!asksInSandbox || paths === undefined) return { approvals: inner, sessionOpened };
  const approvals = inSandboxApprovals({
    inner,
    session: () => session,
    resolve: paths.resolve,
    windows: paths.windows,
    record: ({ tool, detail }) =>
      recorder.record({
        type: "harness.allowed",
        agent: agent.agentId,
        tool,
        detail,
        rule: "asks-in-sandbox",
      }),
  });
  return { approvals, sessionOpened };
}
