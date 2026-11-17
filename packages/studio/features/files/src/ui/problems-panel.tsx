import { useEffect, useId, useRef, useState } from "react";
import type { FileIssue } from "../files-host.ts";
import { filesWords } from "../files-words.ts";
import type { Elsewhere } from "../problems-elsewhere.ts";
import { sortedForList } from "../problems-elsewhere.ts";

/** Props for {@link ProblemsPanel}. */
export interface ProblemsPanelProps {
  /** The problems of the open file. */
  readonly problems: readonly FileIssue[];
  /** The file is read-only because it is large, so it is not checked. */
  readonly tooLong?: boolean;
  /** What changes in this file caused in other files. */
  readonly elsewhere: Elsewhere;
  /** Called when a row is chosen, by click or Enter: the editor puts its cursor there. */
  readonly onGo: (issue: FileIssue) => void;
  /** Called with the first file the changes broke, from the line under the list. */
  readonly onOpenFile: (path: string) => void;
  /** Set when a gutter icon was clicked: the list opens and focus goes to that line's row. `round` makes the same line count again. */
  readonly reveal?: { readonly line: number; readonly round: number } | undefined;
}

/**
 * The problems of the open file, errors first, under the editor (requirement
 * `files.ui.problems-list`). It collapses to its header, which keeps the count.
 */
export function ProblemsPanel({
  problems,
  tooLong = false,
  elsewhere,
  onGo,
  onOpenFile,
  reveal,
}: ProblemsPanelProps) {
  const [open, setOpen] = useState(true);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const sorted = sortedForList(problems);

  useEffect(() => {
    if (reveal === undefined) return;
    setOpen(true);
    // The list is drawn after the state change, so the row is looked up on the next frame.
    const frame = requestAnimationFrame(() =>
      list.current?.querySelector<HTMLElement>(`[data-line="${reveal.line}"]`)?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [reveal]);

  return (
    <section
      aria-label={filesWords.problemsLabel}
      className="flex max-h-48 shrink-0 flex-col border-t border-border bg-surface"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        className="flex items-center gap-2 px-4 py-1 text-left text-small font-medium text-fg outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-accent"
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>
        <span>{filesWords.problems(problems.length)}</span>
      </button>
      <div id={id} hidden={!open} className="min-h-0 overflow-y-auto">
        {sorted.length === 0 ? (
          <p className="px-4 py-1 text-small text-fg-muted">
            {tooLong ? filesWords.tooLongToCheck : filesWords.noProblems}
          </p>
        ) : (
          <ul ref={list} className="grid">
            {sorted.map((issue, index) => (
              <li key={`${index}:${issue.line}:${issue.col}:${issue.severity}:${issue.message}`}>
                <button
                  type="button"
                  data-line={issue.line}
                  aria-label={filesWords.problemRead(issue.severity, issue.line, issue.message)}
                  className="flex w-full items-baseline gap-2 px-4 py-0.5 text-left text-small text-fg outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-accent"
                  onClick={() => onGo(issue)}
                >
                  <span
                    aria-hidden="true"
                    className={issue.severity === "error" ? "text-danger" : "text-warning"}
                  >
                    {issue.severity === "error" ? "✕" : "△"}
                  </span>
                  <span aria-hidden="true">
                    {filesWords.problemLine(issue.line, issue.message)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {elsewhere.count > 0 && elsewhere.firstFile !== undefined && (
          <p className="px-4 py-1 text-small text-fg-muted">
            {filesWords.problemsElsewhere(elsewhere.count)}{" "}
            <button
              type="button"
              className="text-accent-text underline outline-none focus-visible:ring-2 focus-visible:ring-accent"
              onClick={() => onOpenFile(elsewhere.firstFile ?? "")}
            >
              {elsewhere.firstFile}
            </button>
          </p>
        )}
      </div>
    </section>
  );
}
