import { Button } from "@halonicjs/studio-kit";
import { useEffect, useRef } from "react";
import type { FileIssue } from "../files-host.ts";
import { filesWords } from "../files-words.ts";

/** What the panel shows and what its rows do. */
export interface ProblemsPanelProps {
  /** The file's problems in the order they list. */
  readonly issues: readonly FileIssue[];
  /** The file is over the size limit, so it isn't checked. */
  readonly tooLong: boolean;
  /** Problems other files got from the user's edits here, the first one first. */
  readonly elsewhere: readonly FileIssue[];
  readonly open: boolean;
  readonly onToggle: () => void;
  /** The row F8 or a click last landed on. */
  readonly selected: number | undefined;
  /** Moves focus to this row when the object changes (the gutter's mark was clicked). */
  readonly focusRequest: { readonly index: number } | undefined;
  readonly onPick: (index: number) => void;
  readonly onOpenFile: (path: string) => void;
}

/**
 * The Problems list under the editor: one row per error or warning of this file, a muted line
 * when there are none, and under it the problems the user's edits caused in other files. Its
 * header keeps the count when the list is collapsed, so problems never go unseen
 * (requirement `files.ui.problems-panel`). It is not a live region: the count is never announced
 * while the user types.
 */
export function ProblemsPanel(props: ProblemsPanelProps) {
  const { issues, tooLong, elsewhere, open, selected, focusRequest } = props;
  const rows = useRef<(HTMLButtonElement | null)[]>([]);
  const first = elsewhere[0];

  useEffect(() => {
    if (focusRequest !== undefined) rows.current[focusRequest.index]?.focus();
  }, [focusRequest]);

  return (
    <section aria-label="Problems" className="border-t border-border bg-surface text-small">
      <button
        type="button"
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-1 text-left font-medium"
        onClick={props.onToggle}
      >
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>
        {filesWords.problemsTitle(issues.length)}
      </button>
      {open && (
        <div className="max-h-40 overflow-y-auto pb-1">
          {tooLong && <p className="px-4 py-1 text-fg-muted">{filesWords.tooLongToCheck}</p>}
          {!tooLong && issues.length === 0 && (
            <p className="px-4 py-1 text-fg-muted">{filesWords.noProblems}</p>
          )}
          {!tooLong && (
            <ul>
              {issues.map((issue, index) => (
                <li key={`${issue.line}:${issue.col}:${issue.message}`}>
                  <button
                    type="button"
                    ref={(node) => {
                      rows.current[index] = node;
                    }}
                    aria-current={selected === index ? "true" : undefined}
                    className={`flex w-full items-baseline gap-2 px-4 py-0.5 text-left hover:bg-surface-muted ${selected === index ? "bg-surface-muted" : ""}`}
                    onClick={() => props.onPick(index)}
                  >
                    <span
                      aria-hidden="true"
                      className={issue.severity === "error" ? "text-danger" : "text-warning"}
                    >
                      {issue.severity === "error" ? "✕" : "△"}
                    </span>
                    <span className="sr-only">{filesWords.problemSeverity(issue.severity)}: </span>
                    <span className="min-w-0 wrap-anywhere">
                      {filesWords.problemRow(issue.line, issue.message)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {first !== undefined && (
            <p className="flex flex-wrap items-center gap-x-2 px-4 py-1 text-fg-muted">
              {filesWords.causesElsewhere(elsewhere.length)}
              <Button variant="ghost" size="sm" onClick={() => props.onOpenFile(first.file)}>
                {first.file}
              </Button>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
