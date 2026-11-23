import { type ToastMessage, type ToastStore, useToastStore } from "@halonicjs/studio-kit";
import { copyDetailsWords, detailsOf, useCopyDetails } from "@halonicjs/studio-shell";
import { useEffect, useId, useRef, useState } from "react";
import {
  changeLine,
  decidedToast,
  decisionFailureReason,
  undidPartToast,
  undoDecidedAfterToast,
  undoLeftAloneLine,
  undoPartLine,
} from "../plain/proposal-text.ts";
import {
  type ProposalDecided,
  type ProposalDecisions,
  ProposalFailedError,
  type ProposalFailure,
  ProposalGoneError,
} from "../proposal-decisions.ts";
import type { ProposalFile, ProposalItem } from "../proposal-items.ts";

/** Accept or Reject. */
export type ProposalVerb = "accept" | "reject";

/** What a press is on: one file by its path, or every undecided file. */
export type DecisionTarget = { readonly file: string } | "all";

/**
 * A decision that didn't go through (Q11, C665 27): why, which picks its line's words and button,
 * and the error, whose text reaches the person only through **Copy details**.
 */
export interface DecisionFailure {
  readonly verb: ProposalVerb;
  readonly target: DecisionTarget;
  readonly failure: ProposalFailure;
  readonly error: unknown;
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
  /** Whether the host said the proposal's texts are gone, so it can only be removed (Q11). */
  readonly gone: boolean;
  /** Whether the changes were gone and are there again, so the page says so above them (C711 4). */
  readonly back: boolean;
  /** The files an Accept left alone because they changed after the run started; a Reject decides them. */
  readonly changedSinceRun: ReadonlySet<string>;
  /** The last decision said for a screen reader (Q6): "Accepted: notes.md added". */
  readonly announcement: string;
  /** Goes up after each decision, so the page moves focus on (Q6). */
  readonly decided: number;
  decide(verb: ProposalVerb, target: DecisionTarget): void;
  /** Drops the failed decision's line, as once the workspace it was refused in is trusted. */
  clearFailure(): void;
  /** After a Remove found the changes there again and the Inbox read them: they show once more. */
  changesBack(): void;
}

const pastTense = { accept: "Accepted", reject: "Rejected" } as const;

/**
 * Accept and Reject on the open proposal (HAL-11945 Q6, Q7): each decision is one undo step, with
 * a toast and its **Undo** (see {@link useUndoSteps}).
 *
 * @param onDecided after each decision or Undo, and once the proposal settles, so the Inbox reads
 *   its items again and the proposal moves to Done (Q10)
 * @param holdBack while the engine isn't answering, what an **Undo** pressed meanwhile says: it
 *   sends nothing, and a toast that says this and keeps **Undo** replaces its toast
 */
export function useProposalDecisions(
  item: ProposalItem,
  decisions: ProposalDecisions | undefined,
  onDecided: () => void,
  holdBack?: string,
): ProposalDecisionState {
  const [files, setFiles] = useState(item.files);
  const [pending, setPending] = useState<ProposalDecisionState["pending"]>(null);
  const busyId = useId();
  const [failure, setFailure] = useState<DecisionFailure | null>(null);
  const [gone, setGone] = useState(false);
  const [back, setBack] = useState(false);
  const [changedSinceRun, setChangedSinceRun] = useState<ReadonlySet<string>>(new Set());
  const [announcement, setAnnouncement] = useState("");
  const [decided, setDecided] = useState(0);
  const { runId } = item;
  // Settling comes after the page has gone, so it calls the latest `onDecided`, not the first.
  const latestOnDecided = useRef(onDecided);
  latestOnDecided.current = onDecided;
  useFilesFromRefresh(item.files, pending, setFiles);

  function setDecisions(paths: readonly string[], decision: ProposalFile["decision"]) {
    const changing = new Set(paths);
    setFiles((current) =>
      current.map((file) => (changing.has(file.path) ? { ...file, decision } : file)),
    );
  }

  const undoSteps = useUndoSteps(decisions, runId, latestOnDecided, holdBack, (paths) => {
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
      .catch((error: unknown) => {
        if (error instanceof ProposalGoneError) {
          setGone(true);
          setBack(false);
        } else setFailure({ verb, target, failure: failureOf(error), error });
      })
      .finally(() => {
        setPending(null);
        setDecided((count) => count + 1);
      });
    undoSteps.track(deciding);
  }

  function changesBack() {
    setGone(false);
    setBack(true);
  }

  return {
    files,
    pending,
    busyId,
    failure,
    gone,
    back,
    changedSinceRun,
    announcement,
    decided,
    decide,
    clearFailure: () => setFailure(null),
    changesBack,
  };
}

/**
 * Takes the files' decisions from each refresh of the Inbox, such as one made in another window,
 * except while a decision is on its way: the refresh after it brings that decision too.
 */
function useFilesFromRefresh(
  files: readonly ProposalFile[],
  pending: ProposalDecisionState["pending"],
  setFiles: (files: readonly ProposalFile[]) => void,
) {
  const deciding = useRef(false);
  deciding.current = pending !== null;
  const opened = useRef(files);
  useEffect(() => {
    // The first files are already the state's; only a refresh's replace them.
    if (files === opened.current || deciding.current) return;
    setFiles(files);
  }, [files, setFiles]);
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
 * **Undo** keeps working while it shows; the host leaves a proposal still undecided open. While
 * the engine isn't answering, as the page shows it, an **Undo** sends nothing: a toast that says why
 * and keeps **Undo** takes its toast's place. Once the page has gone, an **Undo** is sent, and a
 * failure says so.
 *
 * @param settled once the proposal has settled
 * @param holdBack while the engine isn't answering, what an **Undo** pressed meanwhile says
 * @param undone after an Undo, with the paths the host put back to undecided
 */
function useUndoSteps(
  decisions: ProposalDecisions | undefined,
  runId: string,
  settled: { readonly current: () => void },
  holdBack: string | undefined,
  undone: (paths: readonly string[]) => void,
) {
  const toasts = useToastStore();
  const copyDetails = useCopyDetails();
  const held = useHeldWhile(holdBack);
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
          settled.current();
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
      .then(({ leftAlone, decidedAfter }) => {
        const left = new Set(leftAlone);
        const kept = step.paths.filter((path) => left.has(path));
        const putBack = step.paths.filter((path) => !left.has(path));
        undone(putBack);
        const toast = undoneToast(runId, step.verb, kept, putBack.length, decidedAfter);
        if (toast !== null) toasts?.show(toast);
      })
      .catch((error: unknown) => {
        const failure = failureOf(error);
        const text = decisionFailureReason(failure);
        // Only a reason Halonic can't explain offers the host's own words, to copy (C665 27).
        const details = () => void copyDetails(detailsOf(`${undoFailedTitle} ${text}`, error));
        const action = { label: copyDetailsWords.label, onClick: details };
        toasts?.show({
          tone: "danger",
          title: undoFailedTitle,
          text,
          ...(failure === "unexplained" ? { action } : {}),
        });
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
      let toast: string | undefined;
      // Shows `message` with this step's Undo in place of the toast showing it until now.
      const showWithUndo = (message: Omit<ToastMessage, "action">) => {
        if (toast !== undefined) toasts?.close(toast);
        toast = toasts?.show({ ...message, action: { label: "Undo", onClick, keepOpen: true } });
        if (toast === undefined) return;
        shown.current.add(toast);
        newest.current = toast;
      };
      // A phone shows one toast at a time (C741), so a held-back Undo replaces its toast with one
      // that says why and keeps Undo, rather than showing the reason behind it. A danger toast
      // stays until it's closed, so Undo is still there once the engine answers.
      function onClick() {
        if (held.current !== undefined) {
          const focused = document.activeElement;
          showWithUndo({ tone: "danger", title: undoFailedTitle, text: held.current });
          keepFocusInToasts(toasts, focused);
          return;
        }
        if (toast !== undefined) toasts?.close(toast);
        undo(id, step);
      }
      showWithUndo({ tone: "success", title });
    },
  };
}

/**
 * `holdBack` while the page shows, so a toast's **Undo** reads the page's latest line; `undefined`
 * once the page has gone, since nothing then says the engine isn't answering.
 */
function useHeldWhile(holdBack: string | undefined): { readonly current: string | undefined } {
  const held = useRef(holdBack);
  held.current = holdBack;
  useEffect(
    () => () => {
      held.current = undefined;
    },
    [],
  );
  return held;
}

/**
 * Moves focus to the newest toast's first button when `focused`, which had focus before a toast
 * was replaced, went with the toast it was in: otherwise focus drops to the page, and a keyboard
 * needs F6 to reach the new toast's **Undo** (HAL-16672). Waits until React has drawn the new toast.
 */
function keepFocusInToasts(toasts: ToastStore | null, focused: Element | null): void {
  if (toasts === null || !(focused instanceof HTMLElement)) return;
  queueMicrotask(() => {
    if (!focused.isConnected) toasts.focus();
  });
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

const undoFailedTitle = "Couldn't undo this.";

/**
 * The toast after an Undo that left files as they were (C665 31): a later decision kept it back,
 * it put back some files, or none; nothing when it put back every one.
 */
function undoneToast(
  runId: string,
  verb: ProposalVerb,
  kept: readonly string[],
  putBack: number,
  decidedAfter: boolean,
): ToastMessage | null {
  if (decidedAfter) return { tone: "danger", title: undoDecidedAfterToast(runId) };
  if (kept.length === 0) return null;
  const decided = decidedWords[verb];
  if (putBack === 0) {
    return { tone: "danger", title: undoFailedTitle, text: undoLeftAloneLine(decided, kept) };
  }
  return { tone: "warning", title: undidPartToast(runId), text: undoPartLine(decided, kept) };
}

/** A failure the app sorted keeps its kind; anything else is one Halonic can't explain. */
function failureOf(error: unknown): ProposalFailure {
  return error instanceof ProposalFailedError ? error.failure : "unexplained";
}
