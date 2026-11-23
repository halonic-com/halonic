import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  changedAgainLine,
  changeLine,
  compareWords,
  decidedToast,
  decisionFailureReason,
} from "../plain/proposal-text.ts";
import {
  type ProposalCompare,
  type ProposalCompareChoice,
  type ProposalDecided,
  type ProposalDecisions,
  type ProposalFailure,
  ProposalGoneError,
} from "../proposal-decisions.ts";
import type { ProposalFile, ProposalItem } from "../proposal-items.ts";
import { failureOf, useUndoSteps } from "./use-undo-steps.ts";

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

/** A choice in Compare (Q9): **Keep mine** is a reject, the others accept. */
export type CompareChoice = "keep-mine" | ProposalCompareChoice;

/** Why a choice in Compare wrote nothing, and the choice that **Try again** sends again. */
export interface CompareFailure {
  readonly line: string;
  /** `null` once the file changed again: Compare shows it as it is now, to choose anew. */
  readonly retry: { readonly choice: CompareChoice; readonly seen: string } | null;
}

/** The file Compare is open on, what went wrong with a choice, and how often its texts were read. */
export interface Comparing {
  readonly path: string;
  /** Why the last choice wrote nothing, else `null`. */
  readonly failure: CompareFailure | null;
  /** Goes up when the file changed again after Compare showed it, so Compare reads it again. */
  readonly round: number;
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
  /** Compare, open on one of those, else `null` (Q9). */
  readonly comparing: Comparing | null;
  /** The last decision said for a screen reader (Q6): "Accepted: notes.md added". */
  readonly announcement: string;
  /** Goes up after each decision, so the page moves focus on (Q6). */
  readonly decided: number;
  decide(verb: ProposalVerb, target: DecisionTarget): void;
  /** Drops the failed decision's line, as once the workspace it was refused in is trusted. */
  clearFailure(): void;
  /** After a Remove found the changes there again and the Inbox read them: they show once more. */
  changesBack(): void;
  /** Opens Compare on a file the person changed after the run started. */
  compare(path: string): void;
  /** Closes Compare, and any still to show after it, leaving their files undecided. */
  closeCompare(): void;
  /** The texts Compare shows for `path`. */
  compareTexts(path: string): Promise<ProposalCompare>;
  /** Decides the file Compare is open on, then Compare moves on to the next one, if any. */
  choose(choice: CompareChoice, seen: string): void;
}

const pastTense = { accept: "Accepted", reject: "Rejected" } as const;

/**
 * Accept and Reject on the open proposal (HAL-11945 Q6, Q7): each decision is one undo step, with
 * a toast and its **Undo** (see {@link useUndoSteps}). An Accept that left a file alone because
 * the person changed it after the run started opens Compare on it, one file at a time (Q9).
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
  const [toCompare, setToCompare] = useState<readonly string[]>([]);
  const [compareFailure, setCompareFailure] = useState<CompareFailure | null>(null);
  const [round, setRound] = useState(0);
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
    // A file decided some other way, such as by its own Reject, needs no Compare any more.
    setToCompare((left) => left.filter((path) => !paths.includes(path)));
    const [only] = done;
    if (only === undefined) return;
    const title = decidedToast(pastTense[verb], done.length, runId);
    setAnnouncement(done.length === 1 ? `${pastTense[verb]}: ${changeLine(only)}` : title);
    if (result.undo !== null) undoSteps.offer(title, result.undo, { verb, paths });
  }

  /**
   * Sends one decision: its button is busy meanwhile, then `done` has what it did, or `failed`
   * the error it didn't go through with, unless the proposal turned out to be gone.
   */
  function send(
    verb: ProposalVerb,
    target: DecisionTarget,
    sent: Promise<ProposalDecided>,
    done: (result: ProposalDecided) => void,
    failed: (error: unknown) => void,
  ) {
    setPending({ verb, target });
    const deciding = sent
      .then((result) => {
        undoSteps.decided();
        applied(verb, target, result);
        done(result);
        onDecided();
      })
      .catch((error: unknown) => {
        if (error instanceof ProposalGoneError) {
          setGone(true);
          setBack(false);
        } else failed(error);
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

  function openCompare(paths: readonly string[]) {
    setCompareFailure(null);
    setToCompare(paths);
  }

  function decide(verb: ProposalVerb, target: DecisionTarget) {
    if (decisions === undefined || pending !== null) return;
    setFailure(null);
    const sent =
      verb === "accept" ? decisions.accept(runId, target) : decisions.reject(runId, target);
    send(
      verb,
      target,
      sent,
      (result) => openCompare(result.changedSinceRun),
      (error) => setFailure({ verb, target, failure: failureOf(error), error }),
    );
  }

  function choose(choice: CompareChoice, seen: string) {
    const [path] = toCompare;
    if (decisions === undefined || pending !== null || path === undefined) return;
    setCompareFailure(null);
    const target = { file: path };
    const keep = choice === "keep-mine";
    const sent = keep
      ? decisions.reject(runId, target)
      : decisions.choose(runId, path, choice, seen);
    const done = (result: ProposalDecided) => {
      if (!result.changedSinceRun.includes(path)) return;
      // Saved again after Compare showed it: nothing was written; show it as it is now.
      setCompareFailure({ line: changedAgainLine, retry: null });
      setRound((count) => count + 1);
    };
    const failed = (error: unknown) =>
      setCompareFailure({
        line: `${compareWords.chooseFailed} ${decisionFailureReason(failureOf(error))}`,
        retry: { choice, seen },
      });
    send(keep ? "reject" : "accept", target, sent, done, failed);
  }

  // Kept the same across renders, since Compare reads the texts again whenever it changes.
  const compareTexts = useCallback(
    (path: string): Promise<ProposalCompare> => {
      if (decisions === undefined) return Promise.reject(new Error("Nothing can be decided here."));
      return decisions.compare(runId, path).catch((error: unknown) => {
        if (error instanceof ProposalGoneError) {
          setGone(true);
          setBack(false);
        }
        throw error;
      });
    },
    [decisions, runId],
  );

  const [comparePath] = toCompare;
  return {
    files,
    pending,
    busyId,
    failure,
    gone,
    back,
    changedSinceRun,
    comparing:
      comparePath === undefined ? null : { path: comparePath, failure: compareFailure, round },
    announcement,
    decided,
    decide,
    clearFailure: () => setFailure(null),
    changesBack,
    compare: (path) => openCompare([path]),
    closeCompare: () => openCompare([]),
    compareTexts,
    choose,
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
