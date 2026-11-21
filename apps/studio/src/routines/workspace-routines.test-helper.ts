import type { RunSummary } from "@halonicjs/events";
import { WorkspaceRoutines, type WorkspaceRoutinesParts } from "./workspace-routines.ts";

/** Acme's agent `analyst`, with no harness set. */
export const analystFile = "id: analyst\nname: Analyst\nmodel: fast\ninstructions: Report.\n";
/** Acme's workflow `reply`: one final step. */
export const replyFile =
  "id: reply\nname: Reply\ninitial: first\nstates:\n  first:\n    type: final\n";
/** Acme's routine `weekly-report`: every Monday at 9, it runs `analyst`. */
export const weeklyFile = [
  "# Sent to the team.",
  "name: Weekly report",
  "trigger:",
  '  schedule: "0 9 * * 1"',
  "  timezone: Europe/Amsterdam",
  "run:",
  "  agent: analyst",
  "  prompt: Write the report.",
  "",
].join("\n");
/** The address of acme's `weekly-report`. */
export const weekly = { hubId: "acme", id: "weekly-report" } as const;
/** The time every routine host in these tests reads as now. */
const now = new Date("2026-11-17T08:00:00Z");

/**
 * A {@link WorkspaceRoutines} over files in memory, with the hubs acme and beta, acme's `analyst`,
 * `reply` and `weekly-report`, plus `hub`'s files: the store, the changes it was asked for, and
 * the listeners it registered.
 */
export function setup(
  extra: Partial<WorkspaceRoutinesParts> = {},
  runs: Partial<RunSummary>[] = [],
  hub: Record<string, string> = {},
) {
  const store: Record<string, string> = {
    "hubs/acme/hub.yaml": "id: acme\nname: Acme\n",
    "hubs/beta/hub.yaml": "id: beta\nname: Beta\n",
    "hubs/acme/agents/analyst.agent.yaml": analystFile,
    "hubs/acme/workflows/reply.workflow.yaml": replyFile,
    "hubs/acme/workflows/routines/weekly-report.routine.yaml": weeklyFile,
    ...hub,
  };
  const undoSteps: Record<string, string>[] = [];
  const changes: { label: string; changes: Record<string, string | null> }[] = [];
  const fileListeners = new Set<() => void>();
  const runListeners = new Set<() => void>();
  const host = new WorkspaceRoutines({
    files: {
      read: async (path) => store[path] ?? null,
      list: async (dir) =>
        Object.keys(store)
          .filter((path) => path.startsWith(`${dir}/`))
          .sort(),
      change: (label, made) => {
        const before = { ...store };
        undoSteps.push(before);
        changes.push({ label, changes: made });
        for (const [path, text] of Object.entries(made)) {
          if (text === null) delete store[path];
          else store[path] = text;
        }
      },
      undo: () => {
        const before = undoSteps.pop();
        if (before === undefined) return false;
        for (const path of Object.keys(store)) delete store[path];
        Object.assign(store, before);
        return true;
      },
      get step() {
        return undoSteps.length;
      },
    },
    onChange: (listener) => {
      fileListeners.add(listener);
      return () => fileListeners.delete(listener);
    },
    runs: {
      list: async () => runs.map((summary) => ({ summary: summary as RunSummary })),
      subscribe: (listener) => {
        runListeners.add(listener);
        return () => runListeners.delete(listener);
      },
    },
    timeZone: "UTC",
    now: () => now,
    ...extra,
  });
  return { store, changes, fileListeners, runListeners, host };
}

/** A run `weekly-report`'s schedule started. */
export const weeklyRun = {
  kind: "run",
  trigger: { type: "schedule", routineId: "acme/weekly-report", at: "2026-11-16T08:00:00Z" },
} as const;
