import { Button, EmptyState, SkeletonBar, useToastStore } from "@halonicjs/studio-kit";
import { useEffect, useState } from "react";
import type { WorkflowRef, WorkflowsHost, WorkflowTests } from "../api.ts";
import { failureReason } from "../list/list-words.ts";
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
}

/**
 * The Tests page of Configuration (`workflows.tests`): the summary, **Run tests**, one row per case
 * with a failed case's sentence and **Open run**, and a case's card docked at the right. With no
 * tests there is no header and no button, only the Empty state.
 */
export function TestsPage({ host, workflow, name, openRun }: TestsPageProps) {
  const { load, retry } = useHostRead(host, workflow, (one, ref) => one.tests(ref));
  const toasts = useToastStore();
  const [ran, setRan] = useState<WorkflowTests | undefined>();
  const [done, setDone] = useState<ReadonlyMap<string, boolean> | undefined>();
  const [picked, setPicked] = useState<string | undefined>();
  // A newer read from the host replaces what a run handed back.
  useEffect(() => setRan(undefined), [load]);

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
      const result = await runTests(workflow, (caseName, passed) =>
        setDone((was) => new Map(was).set(caseName, passed)),
      );
      setRan(result);
      const failed = result.cases.filter((one) => one.result?.passed === false).length;
      toasts?.show(
        failed === 0
          ? { tone: "success", title: words.allPassed(result.cases.length) }
          : { tone: "danger", title: words.someFailed(failed, result.cases.length) },
      );
    } catch (error) {
      toasts?.show({
        tone: "danger",
        title: words.cantRun(failureReason(error)),
        action: { label: words.tryAgain, onClick: () => void start() },
      });
    } finally {
      setDone(undefined);
    }
  };

  const rows = testRows(tests.cases, done);
  const open = tests.cases.find((one) => one.name === picked);
  const runIdOf = (caseName: string) =>
    tests.cases.find((one) => one.name === caseName)?.result?.runId;
  return (
    <div className="-m-6 flex min-h-0 flex-1">
      <div className="min-w-0 flex-1 overflow-auto p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <p role="status" className="text-small text-fg-muted">
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
          {rows.map((row) => {
            const runId = runIdOf(row.name);
            return (
              <li
                key={row.name}
                className={`flex items-center gap-3 py-2 ${picked === row.name ? "bg-accent-soft" : ""}`}
              >
                <span
                  aria-hidden="true"
                  className={row.state === "failed" ? "text-danger-text" : "text-fg-muted"}
                >
                  {row.glyph}
                </span>
                <span className="sr-only">{stateWords[row.state]}:</span>
                <button
                  type="button"
                  aria-pressed={picked === row.name}
                  className="focus-ring text-start"
                  onClick={() => setPicked(picked === row.name ? undefined : row.name)}
                >
                  {row.name}
                </button>
                {row.failure && <span className="text-small text-danger-text">{row.failure}</span>}
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
          key={open.name}
          test={open}
          onClose={() => setPicked(undefined)}
          onOpenRun={
            openRun && open.result?.runId !== undefined
              ? () => openRun(open.result?.runId as string)
              : undefined
          }
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
