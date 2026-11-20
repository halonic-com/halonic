/**
 * The most runs a chain of signals may start one after the other: a run that
 * a signal started, whose signal starts another, and so on. The start that
 * would be one more is refused.
 */
export const MAX_SIGNAL_CHAIN = 4;

/** The part of a run summary the loop guard reads: who started the run, and how. */
export interface RunLinks {
  /** The run whose `workflow` step started this one, or `null` for a top-level run. */
  parentRunId: string | null;
  /** `null` for a run started by hand. */
  trigger: {
    type: string;
    /** The routine key, for a run a routine started. */
    routineId?: string;
    /** `<runId>:<seq>` of the signal that started the run, for a signal start. */
    signalId?: string;
  } | null;
}

/** Reads one run, or `null` when the store no longer has it. */
export type ReadRun = (runId: string) => Promise<RunLinks | null>;

/**
 * Why a signal may not start a routine: the routine's own run sent it
 * (`itself`), or the start would make the chain longer than
 * {@link MAX_SIGNAL_CHAIN} (`chain`, with the length it would have had).
 */
export type SignalLoop = { kind: "itself" } | { kind: "chain"; length: number };

/**
 * Whether a signal starting a routine would make a loop, or `null` when the
 * start may go ahead.
 *
 * - **Never itself:** a signal sent by a run of the routine never starts it
 *   again. A `workflow` step's child run counts as the run that started it,
 *   up to the top-level run.
 * - **Chain cap:** from the run that sent the signal, the guard follows each
 *   signal start back to the run whose signal started it, one run read per
 *   step. A chain of {@link MAX_SIGNAL_CHAIN} signal starts may run; the next
 *   start is refused. That also stops two routines that start each other.
 *
 * A run the store no longer has ends the chain there. A run met twice on the
 * way back can only come from a broken store, and is refused as a chain.
 *
 * @param routine - the routine key the signal would start (`<hub>/<id>` or `@workspace/<id>`)
 * @param sentBy - the run that sent the signal, a child run included
 *
 * @example
 * await signalLoop("@workspace/on-paid", "run-1", read);
 * // null, or { kind: "itself" }, or { kind: "chain", length: 5 }
 */
export async function signalLoop(
  routine: string,
  sentBy: string,
  read: ReadRun,
): Promise<SignalLoop | null> {
  const seen = new Set<string>();
  let starts = 0;
  let runId: string | null = sentBy;
  while (runId !== null) {
    const top = await topLevelRun(runId, read, seen);
    if (top === "loop") return { kind: "chain", length: starts + 1 };
    if (top === null) return null;
    if (starts === 0 && top.trigger?.routineId === routine) return { kind: "itself" };
    const signalId = top.trigger?.type === "signal" ? top.trigger.signalId : undefined;
    if (signalId === undefined) return null;
    starts += 1;
    if (starts >= MAX_SIGNAL_CHAIN) return { kind: "chain", length: starts + 1 };
    runId = senderOf(signalId);
  }
  return null;
}

/** The top-level run above `runId`, following child runs to their parents. */
async function topLevelRun(
  runId: string,
  read: ReadRun,
  seen: Set<string>,
): Promise<RunLinks | null | "loop"> {
  let id = runId;
  for (;;) {
    if (seen.has(id)) return "loop";
    seen.add(id);
    const run = await read(id);
    if (run === null || run.parentRunId === null) return run;
    id = run.parentRunId;
  }
}

/** The run that sent a signal: its id is `<runId>:<seq>`, and a run id may hold ":" too. */
function senderOf(signalId: string): string {
  const colon = signalId.lastIndexOf(":");
  return colon === -1 ? signalId : signalId.slice(0, colon);
}
