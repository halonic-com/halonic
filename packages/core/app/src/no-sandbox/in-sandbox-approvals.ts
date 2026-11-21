// The ask policy's second mode (HAL-14992): an agent whose file says
// `asks: in-sandbox` runs Claude Code's own edits and commands in its working
// folder without asking, but only while the call's session is really inside
// Halonic's fence. The fence, not this policy, is what limits a command:
// writes go only to the working folder, the network only to the bridge and
// the agent's sites, and the environment holds no secret. So a shell command
// isn't parsed for paths, which would only look safe. Everything this mode
// doesn't let through goes to the run's own approvals, unchanged.

import type { BridgeApprovals, SandboxFence, SandboxProfile } from "@halonicjs/ports";
import { longCommandLength, toAskToolCall } from "./ask-approvals.ts";
import { askPolicy, type PathResolver } from "./ask-policy.ts";

/** What the policy reads of the call's sandbox session: SandboxSession has both. */
export interface InSandboxSession {
  /** The fence proof the sandbox adapter gave; only `fenced` lets anything through. */
  readonly fence: SandboxFence;
  /** The folder the fence lets the program write to, as the session was opened with it. */
  readonly profile: Pick<SandboxProfile, "workingFolder">;
}

/** A call the policy let through, for the run log. */
export interface InSandboxAllowed {
  /** Claude Code's tool, such as `Edit` or `Bash`. */
  readonly tool: string;
  /** The path it reads or edits, the command it runs (cut at 2,000 characters), or `""`. */
  readonly detail: string;
}

/** What {@link inSandboxApprovals} wraps and reads. */
export interface InSandboxApprovalsOptions {
  /** The run's own approvals, which get every call this mode doesn't let through. */
  readonly inner: BridgeApprovals;
  /**
   * The call's sandbox session, once the engine has opened it; `undefined`
   * before. Read on every call, so a session that closed, or never proved its
   * fence, lets nothing through.
   */
  readonly session: () => InSandboxSession | undefined;
  /** Follows links on this computer; the host's own, so the policy needs no file system. */
  readonly resolve: PathResolver;
  /** Windows: drive and UNC paths, short names and streams. Defaults to `false`. */
  readonly windows?: boolean;
  /** `true` where the file system ignores letter case. Defaults to `windows`. */
  readonly ignoreCase?: boolean;
  /**
   * Writes the call to the run log before it runs. When it throws, the call
   * goes to {@link inner} instead, so nothing runs unasked without a record.
   */
  readonly record: (allowed: InSandboxAllowed) => Promise<void>;
}

/** Claude Code's tools that touch only its own session, never a file or the network. */
const sessionOnlyTools: ReadonlySet<string> = new Set(["TodoWrite"]);

/**
 * Wraps a run's approvals for an agent with `asks: in-sandbox` (requirement
 * `app.in-sandbox-approvals`). While the session's fence is `fenced`, it
 * approves, without asking and after recording it, a read or an edit whose
 * real path is inside the session's working folder and, for an edit, not
 * protected (the ask policy's rules), a `Bash` command, and `TodoWrite`.
 * Every other call, and every call while the fence is in any other state or
 * the session isn't open, goes to `inner` as it came.
 */
export function inSandboxApprovals(options: InSandboxApprovalsOptions): BridgeApprovals {
  return {
    async request(request, context) {
      const allowed = await letThrough(request.tool, request.args, options);
      if (allowed === null) return options.inner.request(request, context);
      try {
        await options.record(allowed);
      } catch {
        return options.inner.request(request, context);
      }
      return { approved: true };
    },
  };
}

/**
 * The call as the run log names it when this mode lets it through, else
 * `null`. Never throws: a path that can't be read fails closed, to the
 * person, as the ask policy's own `unresolved` does.
 */
async function letThrough(
  tool: string,
  args: unknown,
  options: InSandboxApprovalsOptions,
): Promise<InSandboxAllowed | null> {
  try {
    const allowed = await verdictOf(tool, args, options);
    // The session may have closed while a path was resolved.
    return allowed !== null && isFenced(options) ? allowed : null;
  } catch {
    return null;
  }
}

async function verdictOf(
  tool: string,
  args: unknown,
  options: InSandboxApprovalsOptions,
): Promise<InSandboxAllowed | null> {
  const session = options.session();
  if (session === undefined || session.fence.state !== "fenced") return null;
  const call = toAskToolCall(tool, args);
  if (call.kind === "shell") return { tool, detail: call.command.slice(0, longCommandLength) };
  if (call.kind === "other") return sessionOnlyTools.has(call.name) ? { tool, detail: "" } : null;
  const root = await options.resolve(session.profile.workingFolder);
  if (root === null) return null;
  const verdict = await askPolicy(call, {
    projectRoot: root.real,
    resolve: options.resolve,
    ...(options.windows === undefined ? {} : { windows: options.windows }),
    ...(options.ignoreCase === undefined ? {} : { ignoreCase: options.ignoreCase }),
  });
  return verdict.decision === "allow" ? { tool, detail: call.path } : null;
}

function isFenced(options: InSandboxApprovalsOptions): boolean {
  return options.session()?.fence.state === "fenced";
}
