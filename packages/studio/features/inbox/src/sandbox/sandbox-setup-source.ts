import { type SandboxStartCheck, type SandboxStartResult, sandboxStartWords } from "@halonicjs/app";
import type { RunSummary } from "@halonicjs/events";
import { createElement } from "react";
import type { InboxSetupSource, SetupEntry, SetupViewProps } from "../inbox.ts";
import { sandboxInboxWords } from "./sandbox-words.ts";

/** The one account of the sandbox source: the sandbox is per computer, so there is one row. */
export const thisComputer = "this-computer";

/**
 * The runs the sandbox row reads. The app provides it for each open workspace, from the run
 * history; without it the Inbox has no sandbox row.
 */
export interface SandboxRefusals {
  /** Recent real runs of every status, newest first. The Inbox picks out the refused ones. */
  runs(): Promise<readonly RunSummary[]>;
  /** The reason code `run.failed` gave for this run, or `undefined` when it gave none. */
  reasonOf(runId: string): Promise<string | undefined>;
  /** Calls `listener` whenever a run may have started or stopped. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void;
}

/** What the card's view gets besides the item: the check, the reason and the runs that didn't run. */
export interface SandboxCardControl {
  /** Checks the sandbox now; a passing check marks the row fixed. Rejects when the check can't run. */
  check(): Promise<SandboxStartResult>;
  /** The reason code of the newest refusal, as last listed. */
  reason(): string;
  /** The runs that didn't run because of the sandbox, newest first; while fixed, the ones it fixed. */
  runs(): Promise<readonly RunSummary[]>;
}

/** The props of the sandbox card's view. */
export type SandboxViewProps = SetupViewProps & { readonly control: SandboxCardControl };

/**
 * The routine runs the sandbox check refused and nothing has superseded: failed with
 * `sandbox-not-ready`, started by a routine, and no later run of that routine started, which would
 * show the sandbox can start. A hand-started run isn't one: its page says what happened (requirement
 * `inbox.sandbox-row`).
 *
 * @example
 * refusedRoutineRuns(await store.list()); // the runs "2 routines didn't run" counts
 */
export function refusedRoutineRuns(runs: readonly RunSummary[]): RunSummary[] {
  const real = runs.filter((run) => run.kind === "run");
  const isRefused = (run: RunSummary) =>
    run.status === "failed" && run.reason === "sandbox-not-ready";
  // Only a later run of the same routine shows the sandbox can start: other runs may never use it.
  const startedOk = real.filter((run) => !isRefused(run) && run.reason !== "cancelled");
  return real
    .filter(isRefused)
    .filter((run) => run.trigger?.routineId !== undefined)
    .filter(
      (run) =>
        !startedOk.some(
          (ok) => ok.trigger?.routineId === run.trigger?.routineId && ok.startedAt > run.startedAt,
        ),
    )
    .sort(newestFirst);
}

/** How many routines those runs belong to: one routine that failed three times is one. */
function routineCount(runs: readonly RunSummary[]): number {
  return new Set(runs.map((run) => run.trigger?.routineId)).size;
}

/**
 * The Inbox's setup source for the sandbox: one entry for this computer while routines didn't run
 * because the sandbox couldn't start, counting them ("2 routines didn't run"). Its view is the
 * card: the reason and the fix, **Check again**, the guide and the runs that didn't run.
 *
 * A passing check hides the runs it fixes at once and keeps one "fixed" entry, which isn't counted,
 * until its item isn't open any more (`release`). Nothing runs again by itself. The last passing
 * check is kept in memory only: after a restart a refusal shows again until a run starts after it
 * or **Check again** passes.
 *
 * @example
 * inbox.addSetupSource(sandboxSetupSource(refusals, startCheck));
 */
export function sandboxSetupSource(
  refusals: SandboxRefusals,
  startCheck: SandboxStartCheck,
  now: () => Date = () => new Date(),
): InboxSetupSource {
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const listener of [...listeners]) listener();
  };
  let passedAt: string | undefined;
  let fixed: { readonly runs: readonly RunSummary[]; readonly at: string } | undefined;
  let reason = "other";
  let refused: readonly RunSummary[] = [];

  const stillRefused = async () => {
    const runs = refusedRoutineRuns(await refusals.runs());
    return runs.filter((run) => passedAt === undefined || run.startedAt > passedAt);
  };

  const control: SandboxCardControl = {
    async check() {
      const result = await startCheck.check();
      if (result.ok) {
        const listed = refused.length > 0 ? refused : await stillRefused();
        passedAt = now().toISOString();
        if (listed.length > 0) fixed = { runs: listed, at: passedAt };
        refused = [];
        changed();
      }
      return result;
    },
    reason: () => reason,
    async runs() {
      return fixed?.runs ?? (await stillRefused());
    },
  };

  return {
    provider: "sandbox",
    name: sandboxInboxWords.name,
    view: {
      view: "SandboxSetupView",
      load: async () => {
        const { SandboxSetupView } = await import("../ui/sandbox-setup-view.tsx");
        // The Inbox gives a view only its own props, so the control is added here.
        return {
          SandboxSetupView: (props: SetupViewProps) =>
            createElement(SandboxSetupView, { ...props, control }),
        };
      },
    },
    async list() {
      refused = await stillRefused();
      const [newest] = refused;
      if (newest !== undefined) {
        fixed = undefined;
        reason = (await refusals.reasonOf(newest.id)) ?? "other";
        return [
          entry({
            title: sandboxInboxWords.title(routineCount(refused)),
            progress: sandboxStartWords(reason).reason,
            changedAt: newest.endedAt ?? newest.startedAt,
          }),
        ];
      }
      if (fixed === undefined) return [];
      return [
        entry({
          title: sandboxInboxWords.fixedTitle,
          progress: sandboxInboxWords.fixedLine,
          changedAt: fixed.at,
          fixed: true,
        }),
      ];
    },
    subscribe(listener) {
      listeners.add(listener);
      const stop = refusals.subscribe(listener);
      return () => {
        listeners.delete(listener);
        stop();
      };
    },
    release() {
      fixed = undefined;
      changed();
    },
  };
}

function entry(fields: Omit<SetupEntry, "account">): SetupEntry {
  return { account: thisComputer, ...fields };
}

function newestFirst(a: RunSummary, b: RunSummary): number {
  if (a.startedAt === b.startedAt) return 0;
  return a.startedAt < b.startedAt ? 1 : -1;
}
