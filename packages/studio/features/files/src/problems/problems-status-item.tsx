import { Button, Menu, StatusChip } from "@halonicjs/studio-kit";
import type { StatusBarItemProps } from "@halonicjs/studio-shell";
import { openAtFirstProblem, problemEntries, useProblemFiles } from "./problem-count.ts";
import { problemsWords } from "./problems-words.ts";

/**
 * The status bar's problem count (`files.problems.count`): "6 files with problems · Show" on every
 * page while a file of the workspace has an error, and nothing at zero. **Show** opens a menu of
 * the files; each opens its file in Files at the first problem.
 */
export function ProblemsStatusItem({ context }: StatusBarItemProps) {
  const files = useProblemFiles(context, true);
  if (files.length === 0) return null;
  const count = problemsWords.count(files.length);
  return (
    <Menu
      description={problemsWords.description}
      entries={problemEntries(files, (file) => openAtFirstProblem(context, file))}
      trigger={(props) => (
        <Button {...props} variant="ghost" size="xs" name={`${count}. ${problemsWords.show}`}>
          <ProblemCountWords count={count} />
        </Button>
      )}
    />
  );
}

/** The count as the danger chip, then "· Show", as the status bar and the phone strip show it. */
export function ProblemCountWords({ count }: { readonly count: string }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <StatusChip tone="danger" dot>
        {count}
      </StatusChip>
      <span aria-hidden="true">·</span>
      {problemsWords.show}
    </span>
  );
}
