/** The programs an agent runs in, and what the agents host finds of them on this computer. */

/** The programs an agent can run in: Halonic's own loop, Claude Code or Codex (the file's `harness`). */
export type AgentHarnessId = "halonic" | "claude-code" | "codex" | "opencode";

/** The harnesses in the order the Harness page lists them. */
export const agentHarnessIds: readonly AgentHarnessId[] = ["halonic", "claude-code", "codex"];

/**
 * Whether a harness can run on this computer, as the agent host's `detect()` finds it. `signed-out`
 * is for the agent's own settings folder; `failed` means the host found the program but its check
 * didn't work.
 */
export type HarnessReadiness =
  | { readonly status: "ready"; readonly version: string }
  | { readonly status: "signed-out"; readonly version: string }
  | { readonly status: "missing" }
  | { readonly status: "unsupported"; readonly version: string; readonly supported: string }
  | { readonly status: "failed"; readonly error: string };

/**
 * What opening an agent's own sign-in did: a terminal the person can see opened, or none did, with
 * why and the command to run by hand in their own terminal (HAL-5395).
 */
export type HarnessSignIn =
  | { readonly opened: true }
  | { readonly opened: false; readonly reason: string; readonly command: string };
