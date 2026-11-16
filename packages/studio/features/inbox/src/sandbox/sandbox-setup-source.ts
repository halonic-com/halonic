import { type SandboxStartCheck, type SandboxStartResult, sandboxStartWords } from "@halonicjs/app";
import type { RunSummary } from "@halonicjs/events";
import { createElement } from "react";
import type { InboxSetupSource, SetupEntry, SetupViewProps } from "../inbox.ts";
import type { InboxNotices, SandboxFixedNotice } from "../notices/inbox-notices.ts";
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
  /** What the card calls the run: its routine's name. Without it the card names the run's workflow id. */
  nameOf?(run: RunSummary): string;
  /** Calls `listener` whenever a run may have started or stopped. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void;
}

/**
 * Tells when a passing check ran somewhere else, such as a run page's **Check again**. The app
 * provides it; without it the row learns of a pass only from its own card.
 */
export interface SandboxPasses {
  /** Calls `listener` whenever a check passes. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void;
}

/** The sandbox row's source and the "fixed" notices it leaves in Notices. */
export interface SandboxSetup {
  readonly source: InboxSetupSource;
  /** The notice that says the sandbox is ready again, once the row has been seen as Fixed. */
  readonly notices: InboxNotices;
}

/** What the card's view gets besides the item: the check, the reason and the runs that didn't run. */
export interface SandboxCardControl {
  /** Checks the sandbox now; a passing check marks the row fixed. Rejects when the check can't run. */
  check(): Promise<SandboxStartResult>;
  /** The reason code of the newest refusal, as last listed. */
  reason(): string;
  /** The runs that didn't run because of the sandbox, newest first; while fixed, the ones it fixed. */
  runs(): Promise<readonly RunSummary[]>;
  /** What the card calls one of those runs: its routine's name, never the routine's key. */
  name(run: RunSummary): string;
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
  passes?: SandboxPasses,
): InboxSetupSource {
  return sandboxSetup(refusals, startCheck, now, passes).source;
}

/**
 * The sandbox row's source together with its "fixed" notices. A pass on the card keeps the row as
 * Fixed until it is released, then leaves one notice; a pass seen from elsewhere (`passes`) while
 * routines were refused goes straight to a notice. The notice has its ×, and it is gone on the
 * next load.
 *
 * @example
 * const { source, notices } = sandboxSetup(refusals, startCheck, () => new Date(), passes);
 */
export function sandboxSetup(
  refusals: SandboxRefusals,
  startCheck: SandboxStartCheck,
  now: () => Date = () => new Date(),
  passes?: SandboxPasses,
): SandboxSetup {
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const listener of [...listeners]) listener();
  };
  const noticeListeners = new Set<() => void>();
  const noticesChanged = () => {
    for (const listener of [...noticeListeners]) listener();
  };
  let notice: SandboxFixedNotice | undefined;
  // While the card's own check runs, a pass it reports through `passes` is the card's to show.
  let ownCheck = false;
  const leaveNotice = (at: string) => {
    notice = {
      kind: "sandbox-fixed",
      key: `sandbox-fixed:${at}`,
      at,
      title: sandboxInboxWords.fixedNotice,
    };
    noticesChanged();
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
      ownCheck = true;
      let result: SandboxStartResult;
      try {
        result = await startCheck.check();
      } finally {
        ownCheck = false;
      }
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
    name: (run) => refusals.nameOf?.(run) ?? run.workflowId,
  };

  // A check that passed on another screen: nothing is open here to show it Fixed, so it is a notice.
  const watchPasses = () =>
    passes?.subscribe(() => {
      if (ownCheck) return;
      void (async () => {
        const listed = refused.length > 0 ? refused : await stillRefused();
        if (listed.length === 0 || fixed !== undefined) return;
        passedAt = now().toISOString();
        refused = [];
        leaveNotice(passedAt);
        changed();
      })().catch(() => {});
    });

  const source: InboxSetupSource = {
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
      const stopPasses = watchPasses();
      return () => {
        listeners.delete(listener);
        stop();
        stopPasses?.();
      };
    },
    release() {
      if (fixed !== undefined) leaveNotice(fixed.at);
      fixed = undefined;
      changed();
    },
  };

  const notices: InboxNotices = {
    list: async () => (notice === undefined ? [] : [notice]),
    subscribe(listener) {
      noticeListeners.add(listener);
      return () => noticeListeners.delete(listener);
    },
    dismiss(key) {
      if (notice?.key !== key) return;
      notice = undefined;
      noticesChanged();
    },
  };

  return { source, notices };
}

function entry(fields: Omit<SetupEntry, "account">): SetupEntry {
  return { account: thisComputer, ...fields };
}

function newestFirst(a: RunSummary, b: RunSummary): number {
  if (a.startedAt === b.startedAt) return 0;
  return a.startedAt < b.startedAt ? 1 : -1;
}
