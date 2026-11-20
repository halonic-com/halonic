import { Button, EmptyState, SkeletonBar, useToastStore } from "@halonicjs/studio-kit";
import {
  copyDetails,
  copyDetailsWords,
  detailsOf,
  engineReasonFor,
  engineWordsOf,
  isUnexplained,
} from "@halonicjs/studio-shell";
import { useEffect, useId, useRef, useState } from "react";
import type { WorkflowRef, WorkflowsHost, WorkflowTests } from "../api.ts";
import { useHostRead } from "../page/use-workflow.ts";
import { CaseCard } from "./case-card.tsx";
import { testRows, testSummary } from "./test-lines.ts";
import { testsWords as words } from "./tests-words.ts";

/** Props for {@link TestsPage}. */
export interface TestsPageProps {
  readonly host: WorkflowsHost;
  readonly workflow: WorkflowRef;
  /** The workflow's name, for the words while its tests load. */
  readonly name: string;
  /** Opens a test run's card; absent where the app has no run card to open. */
  readonly openRun?: ((runId: string) => void) | undefined;
  /** The name of the case that starts picked, once the cases have loaded: the one just made from a run. */
  readonly pickName?: string | undefined;
  /** The words for "the engine isn't answering", for a failed read or run. */
  readonly notAnswering?: string | undefined;
}

/**
 * The Tests page of Configuration (`workflows.tests`): the summary, **Run tests**, one row per case
 * with a failed case's sentence and **Open run**, and a case's card docked at the right. With no
 * tests there is no header and no button, only the Empty state.
 */
export function TestsPage({
  host,
  workflow,
  name,
  openRun,
  pickName,
  notAnswering,
}: TestsPageProps) {
  const { load, retry } = useHostRead(host, workflow, (one, ref) => one.tests(ref));
  const toasts = useToastStore();
  const [ran, setRan] = useState<WorkflowTests | undefined>();
  const [done, setDone] = useState<ReadonlyMap<number, boolean> | undefined>();
  const [picked, setPicked] = useState<number | undefined>();
  const rowButtons = useRef(new Map<number, HTMLButtonElement>());
  const ids = useId();
  // A newer read from the host replaces what a run handed back.
  useEffect(() => setRan(undefined), [load]);
  // The case made from a run starts picked, once, as soon as the cases have it.
  const pickedByName = useRef(false);
  const loaded = load.kind === "ready" ? load.value : undefined;
  useEffect(() => {
    if (pickName === undefined || pickedByName.current || loaded === undefined) return;
    const at = loaded.cases.findIndex((one) => one.name === pickName);
    if (at < 0) return;
    pickedByName.current = true;
    setPicked(at);
  }, [pickName, loaded]);

  if (load.kind === "failed") {
    return (
      <EmptyState
        tone="error"
        title={words.loadFailedTitle(name)}
        description={load.reason}
        action={{ label: words.tryAgain, onClick: retry }}
      />
    );
  }
  const tests = ran ?? (load.kind === "ready" ? load.value : undefined);
  if (tests === undefined) {
    return (
      <div role="status" className="flex flex-col gap-4">
        <span className="sr-only">{words.loading(name)}</span>
        <SkeletonBar kind="value" />
        <SkeletonBar kind="value" />
      </div>
    );
  }
  if (tests.cases.length === 0) {
    return (
      <EmptyState
        title={words.emptyTitle}
        description={
          <>
            {words.emptyBefore}
            <strong>{words.emptySaveAsTest}</strong>
            {words.emptyAfter}
          </>
        }
      />
    );
  }

  const running = done !== undefined;
  const runTests = host.runTests?.bind(host);
  const start = async () => {
    if (runTests === undefined) return;
    setDone(new Map());
    try {
      const result = await runTests(workflow, (at, passed) =>
        setDone((was) => new Map(was).set(at, passed)),
      );
      setRan(result);
      const failed = result.cases.filter((one) => one.result?.passed === false).length;
      toasts?.show(
        failed === 0
          ? { tone: "success", title: words.allPassed(result.cases.length) }
          : { tone: "danger", title: words.someFailed(failed, result.cases.length) },
      );
    } catch (error) {
      // An internal error reads "Halonic ran into a problem it can't explain yet." with Copy
      // details instead of Try again, which would hit the same bug (microcopy 22 F13, HAL-11626).
      const title = words.cantRun(
        endWithStop(engineReasonFor(error, notAnswering ?? engineWordsOf({}).notAnswering)),
      );
      toasts?.show({
        tone: "danger",
        title,
        action: isUnexplained(error)
          ? {
              label: copyDetailsWords.label,
              onClick: () => void copyDetails(detailsOf(title, error), toasts),
            }
          : { label: words.tryAgain, onClick: () => void start() },
      });
    } finally {
      setDone(undefined);
    }
  };

  const rows = testRows(tests.cases, done);
  const open = picked === undefined ? undefined : tests.cases[picked];
  const openRunId = open?.result?.runId;
  // Closing the card hands focus back to the row that opened it.
  const closeCard = () => {
    if (picked !== undefined) rowButtons.current.get(picked)?.focus();
    setPicked(undefined);
  };
  return (
    <div className="-m-6 flex min-h-0 flex-1">
      <div className="min-w-0 flex-1 overflow-auto p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <p className="text-small text-fg-muted">
            {testSummary(tests, running ? { done: done.size } : undefined)}
          </p>
          {runTests && (
            <Button
              variant="secondary"
              size="sm"
              busy={running}
              busyLabel={words.running}
              onClick={() => void start()}
            >
              {words.run}
            </Button>
          )}
        </div>
        <ul aria-label={words.list} className="flex flex-col divide-y divide-border">
          {rows.map((row, at) => {
            const runId = tests.cases[at]?.result?.runId;
            // The row's button carries its state and a failed test's sentence, for whoever tabs to it.
            const stateId = `${ids}-${at}-state`;
            const failureId = `${ids}-${at}-failure`;
            return (
              <li
                key={at}
                className={`flex items-center gap-3 py-2 ${picked === at ? "bg-accent-soft selected-forced" : ""}`}
              >
                <span
                  aria-hidden="true"
                  className={row.state === "failed" ? "text-danger" : "text-fg-muted"}
                >
                  {row.glyph}
                </span>
                {/* The colon only leads into a failed test's sentence; on its own it's read out. */}
                <span id={stateId} className="sr-only">
                  {stateWords[row.state]}
                  {row.failure ? ":" : null}
                </span>
                <button
                  type="button"
                  ref={(node) => {
                    if (node) rowButtons.current.set(at, node);
                    else rowButtons.current.delete(at);
                  }}
                  aria-pressed={picked === at}
                  aria-describedby={row.failure ? `${stateId} ${failureId}` : stateId}
                  className="focus-ring text-start"
                  onClick={() => setPicked(picked === at ? undefined : at)}
                >
                  {row.name}
                </button>
                {row.failure && (
                  <span id={failureId} className="text-small text-danger">
                    {row.failure}
                  </span>
                )}
                {row.failure && runId !== undefined && openRun && (
                  <Button variant="ghost" size="sm" onClick={() => openRun(runId)}>
                    {words.openRun}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      {open && (
        <CaseCard
          key={picked}
          test={open}
          onClose={closeCard}
          onOpenRun={openRun && openRunId !== undefined ? () => openRun(openRunId) : undefined}
        />
      )}
    </div>
  );
}

const stateWords = {
  passed: words.passed,
  failed: words.failed,
  "not-run": words.notRun,
  waiting: words.waiting,
} as const;

function endWithStop(sentence: string): string {
  return sentence.endsWith(".") ? sentence : `${sentence}.`;
}
