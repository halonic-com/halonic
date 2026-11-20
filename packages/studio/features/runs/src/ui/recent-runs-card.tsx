import type { RunSummary } from "@halonicjs/events";
import { Button, List, type ListRow, StatusChip, usePresentation } from "@halonicjs/studio-kit";
import { firstLoad, type HomeCardProps } from "@halonicjs/studio-shell";
import { use, useCallback, useSyncExternalStore } from "react";
import { type RunnableWorkflow, RunStartHostService, SampleHintService } from "../api.ts";
import { homeWords } from "../home-words.ts";
import { listRows } from "../list/list-rows.ts";
import { recentRuns } from "../list/recent-runs.ts";
import type { RunRow } from "../list/run-row.ts";
import { type RunsList, RunsListService } from "../runs-list.ts";
import { runCommand } from "../start-words.ts";
import { NoWorkflowSentence, type PressRun, PressRunSentence } from "./press-run-line.tsx";

/** Home's Recent runs card: the open workspace's runs, from `RunsListService`. */
export function RecentRunsCard({ context, attempt }: HomeCardProps) {
  const { openPlace, openItem } = context;
  return (
    <RecentRunsView
      list={context.services.get(RunsListService)}
      isSample={context.services.find(SampleHintService)?.isSample() === true}
      canRun={context.services.find(RunStartHostService) !== undefined}
      attempt={attempt}
      {...(openPlace === undefined ? {} : { openRuns: () => openPlace("runs") })}
      {...(openItem === undefined
        ? {}
        : {
            openRun: (run: RunSummary) => openItem({ kind: "run", hub: run.hubId, id: run.id }),
            openWorkflow: ({ hubId, id }: RunnableWorkflow) =>
              openItem({ kind: "workflow", hub: hubId, id }),
          })}
    />
  );
}

/** Props for {@link RecentRunsView}. */
export interface RecentRunsViewProps extends PressRun {
  readonly list: RunsList;
  /** Whether the workspace is the Acme sample, where a run starts from the Inbox. */
  readonly isSample?: boolean;
  /** Whether a workflow's page has **Run** here (an engine), so the note points to it, not the command line. */
  readonly canRun?: boolean;
  /** Opens the Runs place, for **See all runs** on a phone; without it the row isn't there. */
  readonly openRuns?: () => void;
  /** Opens a run's page in the active tab; without it a row can't open. */
  readonly openRun?: (run: RunSummary) => void;
  /** The clock for due times; tests pass a fixed one. */
  readonly now?: () => Date;
  /** The section's Try again count from {@link HomeCardProps}; a new one loads again after a failed first load. */
  readonly attempt?: number;
}

/**
 * Home's Recent runs (checklist part 1, 1.1; UX2 1.9 and 1.15): the latest five runs, running
 * and needs-you ones first, each with its chip and the line the Runs list shows under What ran;
 * a failed run's line is its Failed sentence. The heading's "*N* running" chip is the Runs
 * place's signal, which the shell draws. On a phone, **See all runs** follows the rows. With no
 * runs: "No runs yet. When an agent or workflow runs, you'll see it here." and, so Home doesn't end on
 * nothing, how to start one, naming the first workflow to run, or saying the workspace has none
 * (HAL-10128): open it and press **Run** where its page has Run (HAL-12371), else the command line.
 * In the Acme sample the one line says to start one from the Inbox, with no note under it.
 *
 * The section shows its skeleton until the first list loads, and its error with **Try again** if
 * that load fails; a later failed load keeps the rows as they were.
 */
export function RecentRunsView({
  list,
  isSample = false,
  canRun = false,
  openRuns,
  openRun,
  openWorkflow,
  now = () => new Date(),
  attempt = 0,
}: RecentRunsViewProps) {
  const subscribe = useCallback((listener: () => void) => list.subscribe(listener), [list]);
  const state = useSyncExternalStore(subscribe, () => list.state);
  const phone = usePresentation() === "phone";
  // Called on every render, as React asks: the promise stays settled once the first list is in.
  use(firstLoad(list, attempt));
  const shown = recentRuns(listRows(list, now()));
  const open =
    openRun === undefined
      ? undefined
      : (id: string) => {
          const run = state.runs.find((candidate) => candidate.summary.id === id);
          if (run !== undefined) openRun(run.summary);
        };

  return (
    <>
      <List
        label={homeWords.label}
        rows={shown.map(homeRow)}
        {...(open === undefined ? {} : { onOpen: open })}
        empty={{ title: isSample ? homeWords.sampleEmpty : homeWords.empty, plain: true }}
      />
      {shown.length === 0 && !isSample ? (
        <p className="m-0 px-4 text-fg-muted">
          <StartNote
            workflows={state.workflows}
            folder={state.folder}
            canRun={canRun}
            {...(openWorkflow === undefined ? {} : { openWorkflow })}
          />
        </p>
      ) : null}
      {phone && openRuns !== undefined && shown.length > 0 ? (
        <Button variant="ghost" size="touch" onClick={openRuns}>
          {homeWords.seeAll}
        </Button>
      ) : null}
    </>
  );
}

/**
 * The note under "No runs yet": with **Run**, "Studio shows what your agents are doing and lets
 * you read each run. To start one, open *Weekly report* in Workflows and press **Run**."; without
 * it, the same with `halonic run --dir <folder> weekly-report`. A workspace with no workflow is
 * told to add one. On a Windows folder without **Run** there is no command, so the note keeps only
 * what it can say there (D-A2, HAL-12847).
 */
function StartNote({
  workflows,
  folder,
  canRun,
  openWorkflow,
}: PressRun & {
  readonly workflows: readonly RunnableWorkflow[] | undefined;
  readonly folder: string | undefined;
  readonly canRun: boolean;
}) {
  if (canRun) {
    return (
      <PressRunNote
        workflows={workflows}
        {...(openWorkflow === undefined ? {} : { openWorkflow })}
      />
    );
  }
  const command = runCommand(workflows, folder);
  if (workflows?.length === 0) {
    return command === undefined ? homeWords.noWorkflowNoCommandNote : homeWords.noWorkflowNote;
  }
  if (command === undefined) return homeWords.about.trimEnd();
  return (
    <>
      {homeWords.about}
      {homeWords.startNote[0]}
      <code className="font-mono">{command}</code>
      {homeWords.startNote[2]}
    </>
  );
}

/** The note where a workflow's page has **Run** (HAL-12371): no command, so the folder plays no part. */
function PressRunNote({
  workflows,
  openWorkflow,
}: PressRun & { readonly workflows: readonly RunnableWorkflow[] | undefined }) {
  if (workflows?.length === 0) return <NoWorkflowSentence />;
  return (
    <>
      {homeWords.about}
      <PressRunSentence
        workflows={workflows}
        {...(openWorkflow === undefined ? {} : { openWorkflow })}
      />
    </>
  );
}

/**
 * A run as one row: what ran and which run over its line, and its status chip at the right edge.
 * The title comes first in what a screen reader hears, as the run comes first in the Runs list's
 * row. It wraps rather than being cut, since its short id at the end is what tells two runs of
 * one workflow apart, even beside the chip on a 320px phone (HAL-13305). A failed run's line is
 * the kit's error reason, in `danger`, with the Failed chip, as in the Runs list.
 */
function homeRow(row: RunRow): ListRow {
  return {
    id: row.id,
    title: homeWords.rowTitle(row.workflow, row.shortId),
    wrapTitle: true,
    meta: row.line,
    trailing: (
      <StatusChip tone={row.chip.tone} dot={row.chip.dot}>
        {row.chip.word}
      </StatusChip>
    ),
    ...(row.standing === "failed" ? { error: { reason: row.line, chip: row.chip.word } } : {}),
  };
}
