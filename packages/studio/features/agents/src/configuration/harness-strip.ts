import type { AgentHarnessId, HarnessReadiness } from "../api.ts";

/** The strip above the harness choice, which says why the agent can't run (`agents.configuration.harness`). */
export type HarnessStrip = "not-installed" | "too-old";

/**
 * The one strip the chosen harness needs, or `null`. The rule is harness-states rule 1: one strip
 * at a time, in the order not installed, too old, signed out, sandbox, model. Only the first two
 * are built; a harness whose check failed shows no strip, only its option line (rule 4).
 *
 * @example
 * harnessStrip("codex", { status: "missing" }); // "not-installed"
 */
export function harnessStrip(
  harness: AgentHarnessId,
  readiness: HarnessReadiness | undefined,
): HarnessStrip | null {
  if (harness === "halonic" || readiness === undefined) return null;
  if (readiness.status === "missing") return "not-installed";
  if (readiness.status === "unsupported") return "too-old";
  return null;
}
