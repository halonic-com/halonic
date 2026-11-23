import { Button, HeaderBadgeSheetDialog, usePresentation } from "@halonicjs/studio-kit";
import type { StripProps } from "@halonicjs/studio-shell";
import { useState } from "react";
import { openAtFirstProblem, problemEntries, useProblemFiles } from "./problem-count.ts";
import { ProblemCountWords } from "./problems-status-item.tsx";
import { problemsWords } from "./problems-words.ts";

/**
 * The problem count on a phone (`files.problems.count`), which has no status bar: the same "6
 * files with problems · Show" in a 44px strip under the header. It opens a sheet titled with the
 * count that lists the files. On the desktop the status bar has the count, so the strip draws
 * nothing there.
 */
export function ProblemsStrip({ context }: StripProps) {
  if (usePresentation() !== "phone") return null;
  return <PhoneProblems context={context} />;
}

function PhoneProblems({ context }: StripProps) {
  const files = useProblemFiles(context, true);
  const [sheetOpen, setSheetOpen] = useState(false);
  if (files.length === 0) return null;
  const count = problemsWords.count(files.length);
  const entries = problemEntries(files, (file) => {
    setSheetOpen(false);
    openAtFirstProblem(context, file);
  });
  return (
    <div className="flex min-h-11 items-center border-b border-border px-2">
      <Button
        variant="ghost"
        size="sm"
        name={`${count}. ${problemsWords.show}`}
        onClick={() => setSheetOpen(true)}
      >
        <ProblemCountWords count={count} />
      </Button>
      {sheetOpen ? (
        <HeaderBadgeSheetDialog
          title={count}
          description={problemsWords.description}
          entries={entries}
          onClose={() => setSheetOpen(false)}
        />
      ) : null}
    </div>
  );
}
