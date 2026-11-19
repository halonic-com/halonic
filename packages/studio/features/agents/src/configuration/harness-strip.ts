import type { AgentHarnessId, HarnessReadiness } from "../api.ts";

/** The strip above the harness choice, which says why the agent can't run (`agents.configuration.harness`). */
export type HarnessStrip = "not-installed" | "too-old" | "signed-out";

/**
 * What the Harness page knows of a program: the host's answer, or `unreachable` when the host
 * itself couldn't be asked (the call threw), with the reason.
 */
export type HarnessCheck =
  | HarnessReadiness
  | { readonly status: "unreachable"; readonly error: string };

/**
 * Where each program says how to install and update it, for **How to install** and **How to
 * update** until Halonic's own docs pages exist (HAL-2350 CHECK M1).
 */
export const harnessSetupPages: Readonly<Record<Exclude<AgentHarnessId, "halonic">, string>> = {
  "claude-code": "https://code.claude.com/docs/en/setup",
  codex: "https://developers.openai.com/codex/cli",
};

/**
 * The one strip the chosen harness needs, or `null`. The rule is harness-states rule 1: one strip
 * at a time, in the order not installed, too old, signed out, sandbox, model. Only the first three
 * are built; a harness whose check failed shows no strip, only its option line (rule 4).
 *
 * Signed out is the agent's own sign-in, which it needs only when it uses the program's own
 * subscription. Every Claude Code and Codex agent does today: Studio's bridge passes the program's
 * sign-in on and holds no key for them. An agent whose key Halonic holds will show no strip here
 * (rule 2 on HAL-2350) once the agent's file can name one.
 *
 * @example
 * harnessStrip("codex", { status: "missing" }); // "not-installed"
 */
export function harnessStrip(
  harness: AgentHarnessId,
  readiness: HarnessCheck | undefined,
): HarnessStrip | null {
  if (harness === "halonic" || readiness === undefined) return null;
  if (readiness.status === "missing") return "not-installed";
  if (readiness.status === "unsupported") return "too-old";
  if (readiness.status === "signed-out") return "signed-out";
  return null;
}
