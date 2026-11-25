import type { HarnessTask, SandboxSession } from "@halonicjs/ports";

/**
 * The computers OpenCode runs on in v1: Linux only, where srt gives the
 * fence a network namespace of its own, so OpenCode's private server on
 * `127.0.0.1` is the fence's loopback and not the host's (HAL-16833).
 */
export const supportedPlatforms: readonly string[] = ["linux"];

/** What decides whether an OpenCode run may start. */
export interface OpenCodeStartCheck {
  task: Pick<HarnessTask, "asks">;
  session: Pick<SandboxSession, "fence">;
  /** The computer's platform, as Node's `process.platform` names it. */
  platform: string;
}

/**
 * Why an OpenCode run may not start, or `undefined` when it may
 * (requirement `harness-opencode.refusals`).
 *
 * OpenCode runs with `--auto`, which approves every tool not denied, and it
 * has no sandbox of its own. So Halonic's proven fence is the only limit,
 * and the harness refuses before anything starts unless all three hold:
 *
 * - the computer is Linux ({@link supportedPlatforms});
 * - the agent's file says `asks: in-sandbox`: an agent that asks first
 *   (`asks: always`, or no `asks`) needs a program that waits for a person,
 *   and OpenCode's `run` mode doesn't;
 * - the fence proof says the session is `fenced`.
 *
 * Each reason says what to change, in words a person can act on.
 */
export function opencodeRefusal(check: OpenCodeStartCheck): string | undefined {
  if (!supportedPlatforms.includes(check.platform)) {
    return "OpenCode runs only on Linux for now. Pick another harness for this agent on this computer.";
  }
  if (check.task.asks !== "in-sandbox") {
    return "OpenCode can't ask before it runs a command. Set `asks: in-sandbox` in the agent's file, or pick another harness.";
  }
  const fence = check.session.fence;
  if (fence.state !== "fenced") {
    const why = fence.state === "not-fenced" ? `: ${fence.reason}` : ".";
    return `OpenCode runs only inside a proven sandbox, and this session isn't fenced${why}`;
  }
  return undefined;
}
