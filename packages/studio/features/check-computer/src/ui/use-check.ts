import { useCallback, useEffect, useRef, useState } from "react";
import type { CheckComputerSource } from "../api.ts";
import type { CheckFact, CheckLineId } from "../check-facts.ts";

/** The order the lines show in, whichever answers first, so nothing jumps while the check runs. */
const lineOrder: readonly CheckLineId[] = [
  "engine",
  "workspace",
  "models",
  "default-model",
  "last-run",
  "sandbox",
  "harnesses",
  "network",
  "disk",
  "google",
  "not-checked",
];

function inOrder(facts: readonly CheckFact[]): CheckFact[] {
  return [...facts].sort((a, b) => lineOrder.indexOf(a.check) - lineOrder.indexOf(b.check));
}

/**
 * Gives `onFact` each line the source answers, until it has answered every check or `signal`
 * aborts; an answer after the abort is dropped.
 */
async function collect(
  source: CheckComputerSource,
  signal: AbortSignal,
  onFact: (fact: CheckFact) => void,
): Promise<void> {
  try {
    for await (const fact of source.check(signal)) {
      if (signal.aborted) return;
      onFact(fact);
    }
  } catch (error) {
    // The source gives no line for a check that fails; one that throws anyway is reported here.
    if (!signal.aborted) console.error("Check this computer couldn't finish.", error);
  }
}

/** What {@link useCheck} gives the dialog. */
export interface CheckState {
  /** The lines that have answered so far, in their order. */
  readonly facts: readonly CheckFact[];
  /** True until every check has answered. */
  readonly checking: boolean;
  /** **Check again**: drops the lines and runs every check again. */
  readonly run: () => void;
}

/**
 * Runs the source's checks when the dialog opens, and again on `run`, adding each line as it
 * answers (first-run-progress 4.1). A run that is replaced, or the dialog closing, aborts the
 * one before, so its late answers are dropped and nothing runs on in the background (4.4).
 */
export function useCheck(source: CheckComputerSource): CheckState {
  const [facts, setFacts] = useState<readonly CheckFact[]>([]);
  const [checking, setChecking] = useState(true);
  const running = useRef<AbortController | undefined>(undefined);

  const run = useCallback(() => {
    running.current?.abort();
    const controller = new AbortController();
    running.current = controller;
    setFacts([]);
    setChecking(true);
    void collect(source, controller.signal, (fact) =>
      setFacts((before) => inOrder([...before, fact])),
    ).then(() => {
      if (!controller.signal.aborted) setChecking(false);
    });
  }, [source]);

  useEffect(() => {
    run();
    return () => running.current?.abort();
  }, [run]);

  return { facts, checking, run };
}
