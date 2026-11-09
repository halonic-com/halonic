// The parts of `halonic doctor` that decide, without the words: which mark
// each line gets, what goes under it, and whether the command exits 1.
// The words come from the CLI's message catalogue (cli-output 3.7), so this
// file names facts, never sentences.

import type { HarnessDetection } from "@halonicjs/ports";

/** A line's mark: ✓ `ok`, ! `warning`, ✕ `failed`. The same values `--json` prints. */
export type DoctorStatus = "ok" | "warning" | "failed";

/** What every `doctor` line has, whatever it checks. */
export interface DoctorLine {
  status: DoctorStatus;
}

/** A harness Halonic can start, and what its `detect()` found on this computer. */
export interface DetectedHarness {
  /** The value of `harness` in an agent's file, such as "codex". */
  id: string;
  /** The name a person reads, such as "Codex". */
  name: string;
  detection: HarnessDetection;
}

/** An agent of the workspace whose harness isn't Halonic's own. */
export interface HarnessAgent {
  /** The agent's name as a person reads it, such as "Writer". */
  agent: string;
  /** The value of `harness` in the agent's file, such as "codex". */
  harness: string;
}

/** A harness that shows on the ✓ part of the line, such as "Claude Code 2.1.0". */
export interface InstalledHarness {
  harness: string;
  name: string;
  version: string;
}

/** One ! under the Harnesses line. Each names the harness, and `missing` names the agent too. */
export type HarnessProblem =
  /** "*Writer* uses *Codex*, and it isn't installed." One per agent, so each agent that can't start is named. */
  | { problem: "missing"; agent: string; harness: string; name: string }
  /** "*Claude Code 0.9.1* isn't supported. Halonic needs *1.0.0* or newer." */
  | { problem: "unsupported"; harness: string; name: string; version: string; supported: string }
  /** "Halonic found *Claude Code* but couldn't ask its version: *error*" */
  | { problem: "failed"; harness: string; name: string; error: string };

/** The Harnesses line of `halonic doctor` (P5 on HAL-2264). */
export interface HarnessesLine extends DoctorLine {
  check: "harnesses";
  /** Never `failed`: a harness that isn't ready stops only the agents that use it, like a model alias without a key. */
  status: "ok" | "warning";
  /** The harnesses that are ready, in the order given. */
  installed: InstalledHarness[];
  /** In the order of the agents, then of the harnesses. */
  problems: HarnessProblem[];
}

/**
 * The Harnesses line of `halonic doctor` (requirement `app.doctor-harnesses`).
 *
 * A harness that is ready is listed. A harness that isn't ready is a
 * warning only when an agent uses it: Halonic doesn't need a harness no
 * agent uses, so it isn't marked. When no harness is ready and no agent
 * uses one, there's nothing to say, so there's no line.
 *
 * @param harnesses every harness Halonic can start other than its own, with what `detect()` found
 * @param agents the workspace's agents whose harness isn't Halonic's own, or none outside a workspace
 * @throws Error when an agent names a harness that isn't in `harnesses`, because the agent file's
 *   format only allows harnesses Halonic has
 *
 * @example
 * harnessesLine(
 *   [{ id: "codex", name: "Codex", detection: { status: "missing" } }],
 *   [{ agent: "Writer", harness: "codex" }],
 * );
 * // { check: "harnesses", status: "warning", installed: [],
 * //   problems: [{ problem: "missing", agent: "Writer", harness: "codex", name: "Codex" }] }
 */
export function harnessesLine(
  harnesses: readonly DetectedHarness[],
  agents: readonly HarnessAgent[],
): HarnessesLine | undefined {
  const byId = new Map(harnesses.map((harness) => [harness.id, harness]));
  for (const { agent, harness } of agents) {
    if (!byId.has(harness))
      throw new Error(
        `The agent ${agent} uses the harness ${harness}, which Halonic doesn't have.`,
      );
  }

  const installed = harnesses.flatMap(installedHarness);
  const problems = [...missingProblems(byId, agents), ...harnessProblems(harnesses, agents)];
  if (installed.length === 0 && problems.length === 0) return undefined;

  return {
    check: "harnesses",
    status: problems.length === 0 ? "ok" : "warning",
    installed,
    problems,
  };
}

function installedHarness({ id, name, detection }: DetectedHarness): InstalledHarness[] {
  if (detection.status !== "ready") return [];
  return [{ harness: id, name, version: detection.version }];
}

/** One problem per agent whose harness isn't installed. */
function missingProblems(
  byId: ReadonlyMap<string, DetectedHarness>,
  agents: readonly HarnessAgent[],
): HarnessProblem[] {
  const problems: HarnessProblem[] = [];
  for (const { agent, harness } of agents) {
    const detected = byId.get(harness);
    if (detected?.detection.status !== "missing") continue;
    problems.push({ problem: "missing", agent, harness, name: detected.name });
  }
  return problems;
}

/** One problem per used harness that is installed but can't run: the fix is the same for every agent. */
function harnessProblems(
  harnesses: readonly DetectedHarness[],
  agents: readonly HarnessAgent[],
): HarnessProblem[] {
  const used = new Set(agents.map((agent) => agent.harness));
  const problems: HarnessProblem[] = [];
  for (const { id, name, detection } of harnesses) {
    if (!used.has(id)) continue;
    if (detection.status === "unsupported") {
      problems.push({
        problem: "unsupported",
        harness: id,
        name,
        version: detection.version,
        supported: detection.supported,
      });
    }
    if (detection.status === "failed") {
      problems.push({ problem: "failed", harness: id, name, error: detection.error });
    }
  }
  return problems;
}

/** The summary under the lines, and the exit code's one input. */
export interface DoctorSummary {
  /** Lines marked ✕: "*1* problem." */
  problems: number;
  /** Lines marked !: "*1* warning." */
  warnings: number;
  /** True only when a line is ✕. A warning never makes `doctor` exit 1, so CI can gate on it. */
  needsFixing: boolean;
}

/**
 * Counts the lines of `halonic doctor` for its summary and exit code
 * (requirement `app.doctor-summary`). Only a ✕ line needs fixing: a !
 * line prints but exits 0 (cli-output 3.7, Liam on HAL-1984).
 *
 * @example
 * doctorSummary([{ status: "ok" }, { status: "warning" }]);
 * // { problems: 0, warnings: 1, needsFixing: false }
 */
export function doctorSummary(lines: readonly DoctorLine[]): DoctorSummary {
  const problems = lines.filter((line) => line.status === "failed").length;
  const warnings = lines.filter((line) => line.status === "warning").length;
  return { problems, warnings, needsFixing: problems > 0 };
}
