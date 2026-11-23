import {
  Button,
  HeaderBadgeSheetDialog,
  List,
  type ListRow,
  Menu,
  PlaceIcon,
  type PlaceIconName,
  usePresentation,
} from "@halonicjs/studio-kit";
import {
  type FileWithErrors,
  type FileWithErrorsKind,
  type HomeCardProps,
  HomeSectionEmpty,
  type WorkspaceContext,
} from "@halonicjs/studio-shell";
import { useState } from "react";
import { openAtFirstProblem, problemEntries, useProblemFiles } from "./problem-count.ts";
import { problemsWords } from "./problems-words.ts";

/** How many files Problems lists before "Show all 12 files" (C348). */
export const HOME_ROWS = 5;

/** Each kind's place, whose icon starts its row. */
const kindIcons: Readonly<Record<FileWithErrorsKind, PlaceIconName>> = {
  agent: "agents",
  workflow: "workflows",
  routine: "routines",
  connector: "library",
};

/**
 * Home's Problems (`files.problems.home`), above Needs you: the first five files with errors, each
 * with its kind's icon, its name, "Line N: *reason*" in danger and its "1 problem" chip, under the
 * heading the shell draws with the count, "Problems · 6 files". Past five, "Show all 12 files"
 * opens the status bar's list. A row opens its file at the first problem. With no file with
 * errors the whole section is gone.
 */
export function ProblemsHomeCard({ context }: HomeCardProps) {
  // The status bar says the count's changes; Home showing the same count says nothing more.
  const files = useProblemFiles(context, false);
  if (files.length === 0) return <HomeSectionEmpty />;
  const byPath = new Map(files.map((file) => [file.path, file]));
  return (
    <>
      <List
        label={problemsWords.homeTitle}
        rows={files.slice(0, HOME_ROWS).map(problemRow)}
        onOpen={(path) => {
          const file = byPath.get(path);
          if (file !== undefined) openAtFirstProblem(context, file);
        }}
      />
      {files.length > HOME_ROWS ? <ShowAll context={context} files={files} /> : null}
    </>
  );
}

/** A file's row: what a screen reader hears follows C348 A2, "Sorter, agent, 1 problem. Line 2: …". */
function problemRow(file: FileWithErrors): ListRow {
  const reason = problemsWords.line(file.firstError.line, file.firstError.reason);
  const chip = problemsWords.problems(file.errors);
  return {
    id: file.path,
    title: file.name,
    icon: <PlaceIcon name={kindIcons[file.kind]} />,
    error: { reason, chip },
    label: `${file.name}, ${problemsWords.kinds[file.kind].toLowerCase()}, ${chip}. ${reason}`,
  };
}

/** "Show all 12 files": the status bar's menu on the desktop, the strip's sheet on a phone. */
function ShowAll({
  context,
  files,
}: {
  readonly context: WorkspaceContext;
  readonly files: readonly FileWithErrors[];
}) {
  const phone = usePresentation() === "phone";
  const [sheetOpen, setSheetOpen] = useState(false);
  const label = problemsWords.showAll(files.length);
  if (!phone) {
    return (
      <Menu
        description={problemsWords.description}
        entries={problemEntries(files, (file) => openAtFirstProblem(context, file))}
        trigger={(props) => (
          <Button {...props} variant="ghost" size="sm">
            {label}
          </Button>
        )}
      />
    );
  }
  return (
    <>
      <Button variant="ghost" size="touch" onClick={() => setSheetOpen(true)}>
        {label}
      </Button>
      {sheetOpen ? (
        <HeaderBadgeSheetDialog
          title={problemsWords.count(files.length)}
          description={problemsWords.description}
          entries={problemEntries(files, (file) => {
            setSheetOpen(false);
            openAtFirstProblem(context, file);
          })}
          onClose={() => setSheetOpen(false)}
        />
      ) : null}
    </>
  );
}
