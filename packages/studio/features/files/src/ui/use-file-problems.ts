import { useEffect, useState } from "react";
import type { FileIssue, FilesHost } from "../files-host.ts";

/** How long after the last change the whole workspace is checked again (flow 4.2). */
export const recheckAfterMs = 300;

/** What the checks say about one open file. */
export interface FileProblems {
  /** The file's own errors and warnings, errors first, then by line and column. */
  readonly here: readonly FileIssue[];
  /** The problems other files have now that they didn't have when the tab opened. */
  readonly elsewhere: readonly FileIssue[];
  /** The line where the file stopped being valid YAML, or `null`. */
  readonly syntaxLine: number | null;
}

const none: FileProblems = { here: [], elsewhere: [], syntaxLine: null };

const keyOf = (issue: FileIssue): string =>
  `${issue.file}|${issue.line}|${issue.col}|${issue.message}`;

/** Errors before warnings, then by line and column. */
function inPanelOrder(issues: readonly FileIssue[]): FileIssue[] {
  const rank = (issue: FileIssue) => (issue.severity === "error" ? 0 : 1);
  return [...issues].sort((a, b) => rank(a) - rank(b) || a.line - b.line || a.col - b.col);
}

/**
 * Checks the workspace with the file's unsaved changes applied: when the tab opens, and again
 * {@link recheckAfterMs} after the last change. The check runs in the background, so typing
 * never waits for it. The problems other files have when the tab opens are the ones the user's
 * edits didn't cause, so only newer ones show as caused here (requirement `files.ui.problems-panel`).
 *
 * @param checked - `false` for a file that isn't checked (over the size limit, or not open yet)
 */
export function useFileProblems(host: FilesHost, path: string, checked: boolean): FileProblems {
  const [problems, setProblems] = useState<FileProblems>(none);

  useEffect(() => {
    setProblems(none);
    if (!checked) return;
    let stopped = false;
    let newest = 0;
    let baseline: ReadonlySet<string> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function check(): Promise<void> {
      const turn = ++newest;
      try {
        const [issues, syntaxLine] = await Promise.all([
          host.problems(),
          host.yamlSyntaxLine(path),
        ]);
        // A later check, or leaving the file, makes this answer old.
        if (stopped || turn !== newest) return;
        const others = issues.filter((issue) => issue.file !== path);
        baseline ??= new Set(others.map(keyOf));
        setProblems({
          here: inPanelOrder(issues.filter((issue) => issue.file === path)),
          elsewhere: others.filter((issue) => !baseline?.has(keyOf(issue))),
          syntaxLine,
        });
      } catch {
        // The next change checks again; until then the last answer stands.
      }
    }

    void check();
    const stop = host.subscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(() => void check(), recheckAfterMs);
    });
    return () => {
      stopped = true;
      clearTimeout(timer);
      stop();
    };
  }, [host, path, checked]);

  return problems;
}
