import { type ToastStore, useToastStore } from "@halonicjs/studio-kit";
import { useEffect, useId, useRef, useState } from "react";
import { changeLine, decidedToast, undoLeftAloneLine } from "../plain/proposal-text.ts";
import type { ProposalDecided, ProposalDecisions } from "../proposal-decisions.ts";
import type { ProposalFile, ProposalItem } from "../proposal-items.ts";

/** Accept or Reject. */
export type ProposalVerb = "accept" | "reject";

/** What a press is on: one file by its path, or every undecided file. */
export type DecisionTarget = { readonly file: string } | "all";

/** A decision that didn't go through, for its line's **Try again** (Q11). */
export interface DecisionFailure {
  readonly verb: ProposalVerb;
  readonly target: DecisionTarget;
  readonly reason: string;
}

/** The open proposal's decisions, as its page shows them. */
export interface ProposalDecisionState {
  /** The proposal's files with what was decided on each since the page opened. */
  readonly files: readonly ProposalFile[];
  /** The decision on its way, whose button is busy; the others ignore presses meanwhile. */
  readonly pending: { readonly verb: ProposalVerb; readonly target: DecisionTarget } | null;
  /** The busy button's `id`, which the others point at as why they're unavailable meanwhile. */
  readonly busyId: string;
  readonly failure: DecisionFailure | null;
  /** The files an Accept left alone because the person changed them after the run started. */
  readonly changedSinceRun: ReadonlySet<string>;
  /** The last decision said for a screen reader (Q6): "Accepted: notes.md added". */
  readonly announcement: string;
  /** Goes up after each decision, so the page moves focus on (Q6). */
  readonly decided: number;
  decide(verb: ProposalVerb, target: DecisionTarget): void;
}

const pastTense = { accept: "Accepted", reject: "Rejected" } as const;

/**
 * Accept and Reject on the open proposal (HAL-11945 Q6, Q7): each decision is one undo step, with
 * a toast and its **Undo** (see {@link useUndoSteps}).
 *
 * @param onDecided after each decision or Undo, so the Inbox reads its items again
 */
export function useProposalDecisions(
  item: ProposalItem,
  decisions: ProposalDecisions | undefined,
  onDecided: () => void,
): ProposalDecisionState {
  const [files, setFiles] = useState(item.files);
  const [pending, setPending] = useState<ProposalDecisionState["pending"]>(null);
  const busyId = useId();
  const [failure, setFailure] = useState<DecisionFailure | null>(null);
  const [changedSinceRun, setChangedSinceRun] = useState<ReadonlySet<string>>(new Set());
  const [announcement, setAnnouncement] = useState("");
  const [decided, setDecided] = useState(0);
  const { runId } = item;

  function setDecisions(paths: readonly string[], decision: ProposalFile["decision"]) {
    const changing = new Set(paths);
    setFiles((current) =>
      current.map((file) => (changing.has(file.path) ? { ...file, decision } : file)),
    );
  }

  const undoSteps = useUndoSteps(decisions, runId, (paths) => {
    setDecisions(paths, "undecided");
    onDecided();
  });

  function applied(verb: ProposalVerb, target: DecisionTarget, result: ProposalDecided) {
    const done = decidedFiles(files, target, result);
    const paths = done.map((file) => file.path);
    setDecisions(result.cantBeWritten, "not-applicable");
    setDecisions(paths, verb === "accept" ? "accepted" : "rejected");
    setChangedSinceRun((current) => new Set([...current, ...result.changedSinceRun]));
    const [only] = done;
    if (only === undefined) return;
    const title = decidedToast(pastTense[verb], done.length, runId);
    setAnnouncement(done.length === 1 ? `${pastTense[verb]}: ${changeLine(only)}` : title);
    if (result.undo !== null) undoSteps.offer(title, result.undo, { verb, paths });
  }

  function decide(verb: ProposalVerb, target: DecisionTarget) {
    if (decisions === undefined || pending !== null) return;
    setPending({ verb, target });
    setFailure(null);
    const sent =
      verb === "accept" ? decisions.accept(runId, target) : decisions.reject(runId, target);
    const deciding = sent
      .then((result) => {
        undoSteps.decided();
        applied(verb, target, result);
        onDecided();
      })
      .catch((error: unknown) => setFailure({ verb, target, reason: reasonOf(error) }))
      .finally(() => {
        setPending(null);
        setDecided((count) => count + 1);
      });
    undoSteps.track(deciding);
  }

  return { files, pending, busyId, failure, changedSinceRun, announcement, decided, decide };
}

/**
 * The files a decision on `target` decided: those undecided before it, less the ones it left
 * alone because they changed since the run started or can't be written.
 */
function decidedFiles(
  files: readonly ProposalFile[],
  target: DecisionTarget,
  result: ProposalDecided,
): ProposalFile[] {
  const undecided = files.filter((file) => file.decision === "undecided");
  const asked = target === "all" ? undecided : undecided.filter((f) => f.path === target.file);
  const leftAlone = new Set([...result.changedSinceRun, ...result.cantBeWritten]);
  return asked.filter((file) => !leftAlone.has(file.path));
}

/** The decision an **Undo** takes back. */
interface UndoStep {
  readonly verb: ProposalVerb;
  readonly paths: readonly string[];
}

const decidedWords = { accept: "accepted", reject: "rejected" } as const;

/**
 * The toasts with **Undo** of one proposal's decisions. Only the newest decision's toast is
 * offered: the host takes back a step only while the run's decisions are as that step left them,
 * so an older **Undo** couldn't work after a newer decision. Leaving the page settles the proposal
 * once a decision on its way and any Undo pressed are done and the last toast has gone, so every
 * **Undo** keeps working while it shows; the host leaves a proposal still undecided open.
 *
 * @param undone after an Undo, with the paths the host put back to undecided
 */
function useUndoSteps(
  decisions: ProposalDecisions | undefined,
  runId: string,
  undone: (paths: readonly string[]) => void,
) {
  const toasts = useToastStore();
  const shown = useRef(new Set<string>());
  const newest = useRef<string | null>(null);
  const inFlight = useRef(new Set<Promise<void>>());
  const decidedOnce = useRef(false);
  useEffect(
    () => () => {
      if (decisions === undefined) return;
      const waiting = [...inFlight.current];
      if (!decidedOnce.current && waiting.length === 0) return;
      // A decision still on its way shows its toast first, so settling waits for that toast too.
      void Promise.allSettled(waiting).then(() => {
        if (!decidedOnce.current) return;
        settleWhenToastsClose(toasts, shown.current, async () => {
          await Promise.allSettled([...inFlight.current]);
          await decisions.settle(runId);
        });
      });
    },
    [decisions, runId, toasts],
  );

  function track(work: Promise<void>) {
    inFlight.current.add(work);
    void work.finally(() => inFlight.current.delete(work));
  }

  function undo(id: string, step: UndoStep) {
    if (decisions === undefined) return;
    const restoring = decisions
      .undo(id)
      .then(({ leftAlone }) => {
        const left = new Set(leftAlone);
        const kept = step.paths.filter((path) => left.has(path));
        undone(step.paths.filter((path) => !left.has(path)));
        if (kept.length === 0) return;
        const text = undoLeftAloneLine(decidedWords[step.verb], kept);
        toasts?.show({ tone: "danger", title: "Couldn't undo this.", text });
      })
      .catch((error: unknown) => {
        toasts?.show({ tone: "danger", title: "Couldn't undo this.", text: reasonOf(error) });
      });
    track(restoring);
  }

  return {
    /** Notes that a decision went through, so leaving the page settles the proposal, and closes the older **Undo**. */
    decided: () => {
      decidedOnce.current = true;
      if (newest.current !== null) toasts?.close(newest.current);
      newest.current = null;
    },
    /** Keeps the page from settling the proposal before `work`, a decision on its way, is done. */
    track,
    /** Shows the decision's toast, whose **Undo** takes back step `id`. */
    offer: (title: string, id: string, step: UndoStep) => {
      const toast = toasts?.show({
        tone: "success",
        title,
        action: { label: "Undo", onClick: () => undo(id, step) },
      });
      if (toast === undefined) return;
      shown.current.add(toast);
      newest.current = toast;
    },
  };
}

/** Runs `settle` once none of the toasts `ids` shows, now when none does. */
function settleWhenToastsClose(
  toasts: ToastStore | null,
  ids: ReadonlySet<string>,
  settle: () => Promise<void>,
): void {
  const run = () => {
    settle().catch((error: unknown) => console.error("Couldn't settle the run proposal", error));
  };
  const showing = (store: ToastStore) => store.list().some((toast) => ids.has(toast.id));
  if (toasts === null || !showing(toasts)) {
    run();
    return;
  }
  const stop = toasts.subscribe(() => {
    if (showing(toasts)) return;
    stop();
    // After the toast's own click, so an Undo pressed on it starts before the proposal settles.
    queueMicrotask(run);
  });
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
