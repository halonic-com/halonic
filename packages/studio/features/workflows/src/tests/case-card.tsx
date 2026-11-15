import { Button, CloseIcon } from "@halonicjs/studio-kit";
import { type KeyboardEvent, useEffect, useRef } from "react";
import type { WorkflowTestCase } from "../api.ts";
import { type PathSplit, pathSplit } from "./test-lines.ts";
import { testsWords as words } from "./tests-words.ts";

/** Props for {@link CaseCard}. */
export interface CaseCardProps {
  readonly test: WorkflowTestCase;
  readonly onClose: () => void;
  /** Opens the test's run; absent when the host or the result has no run to open. */
  readonly onOpenRun?: (() => void) | undefined;
}

/**
 * A test case docked at the right over the Tests page (`workflows.tests.page`): its name, its
 * input and where it should end, and for a failed case with an expected path both paths side by
 * side, marked from the first difference. Read-only until the save model's fields land.
 */
export function CaseCard({ test, onClose, onOpenRun }: CaseCardProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const { result } = test;
  const split =
    result?.passed === false && result.expectedPath && result.actualPath
      ? pathSplit(result.expectedPath, result.actualPath)
      : undefined;
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") onClose();
  };
  return (
    <aside
      aria-label={words.case(test.name)}
      onKeyDown={onKeyDown}
      className="flex w-120 shrink-0 flex-col gap-4 overflow-auto border-s border-border bg-surface-raised p-6 shadow-2"
    >
      <div className="flex items-center justify-between">
        <h2 ref={heading} tabIndex={-1} className="text-title">
          {test.name}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          icon={<CloseIcon />}
          label={words.close}
          onClick={onClose}
        />
      </div>
      <dl className="flex flex-col gap-3">
        <div>
          <dt className="text-small text-fg-muted">{words.name}</dt>
          <dd>{test.name}</dd>
        </div>
        <div>
          <dt className="text-small text-fg-muted">{words.input}</dt>
          <dd>
            <pre className="whitespace-pre-wrap rounded-sm bg-surface-muted p-3 font-mono text-small">
              {test.input}
            </pre>
          </dd>
        </div>
        {test.endsIn !== undefined && (
          <div>
            <dt className="text-small text-fg-muted">{words.endsIn}</dt>
            <dd className="font-mono">{test.endsIn}</dd>
          </div>
        )}
      </dl>
      {result?.passed === false && (
        <section className="flex flex-col gap-3">
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-sm bg-danger-soft p-3 text-danger-text"
          >
            <p>{split?.sentence ?? result.failure}</p>
            {onOpenRun && (
              <Button variant="secondary" size="sm" onClick={onOpenRun}>
                {words.openRun}
              </Button>
            )}
          </div>
          {split && result.expectedPath && result.actualPath && (
            <div className="grid grid-cols-2 gap-4">
              <PathColumn title={words.expected} path={result.expectedPath} split={split} />
              <PathColumn title={words.thisRun} path={result.actualPath} split={split} actual />
            </div>
          )}
        </section>
      )}
    </aside>
  );
}

/** One side of the path split: numbered steps, with a bar on the first difference. */
function PathColumn({
  title,
  path,
  split,
  actual = false,
}: {
  readonly title: string;
  readonly path: readonly string[];
  readonly split: PathSplit;
  readonly actual?: boolean;
}) {
  return (
    <div>
      <h3 className="text-caption text-fg-muted">{title}</h3>
      <ol className="flex flex-col">
        {path.map((step, at) => {
          const tone = stepTone(at, split.at, actual);
          return (
            <li key={at} className={`flex h-7 items-center gap-2 px-2 ${tone}`}>
              <span className="text-caption text-fg-subtle tabular-nums">{at + 1}</span>
              <span className="font-mono">{step}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** The look of one step: the first difference is marked, and this run's steps after it are muted. */
function stepTone(at: number, first: number, actual: boolean): string {
  if (at === first) {
    return actual
      ? "border-s-2 bg-danger-soft text-danger-text"
      : "border-s-2 bg-surface-muted text-fg";
  }
  return actual && at > first ? "text-fg-muted" : "";
}
