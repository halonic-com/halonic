import { StatusChip, type StatusChipTone } from "@halonicjs/studio-kit";
import { Fragment } from "react";
import type { QueueView } from "../merge-queue.ts";
import { mergeQueueWords } from "../merge-queue-words.ts";
import type { PullRequestRow } from "../pull-requests.ts";
import type { TeamClock } from "../team-format.ts";
import { listBox, Note, Section } from "./pr-list-parts.tsx";
import { GroupHeaderRow, QueueHeaderRow, QueueRow, TakenOutRow } from "./queue-rows.tsx";

/** The health chip's tone: amber while pushes wait, red once the queue has stopped. */
const healthTones: Record<QueueView["health"], StatusChipTone> = {
  running: "success",
  "runners-busy": "attention",
  stopped: "danger",
  empty: "neutral",
  other: "neutral",
};

/**
 * The queue's health in its band (HAL-17515 P1 under the list tabs, P18 on the Queue tab):
 * "Merge queue: Running · 7 PRs · group 2 of 3 building · no runner wait". The state is a chip
 * with its dot and word, never colour alone. The band keeps room on its right for the merge
 * queue's GitHub link once the port carries one.
 */
export function QueueHealth(props: { view: QueueView; where: "list" | "queue" }) {
  const { chip, details } = mergeQueueWords.health(props.view, props.where);
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface-subtle px-4 py-3">
      <p className="flex flex-wrap items-center gap-y-1 text-small">
        {props.where === "list" && props.view.health !== "empty" ? (
          <span className="mr-1 text-fg-muted">{mergeQueueWords.linePrefix}</span>
        ) : null}
        {chip === "" ? null : (
          <StatusChip tone={healthTones[props.view.health]} dot>
            {chip}
          </StatusChip>
        )}
        {details.map((detail, index) => (
          // Kept as written: a flex row would drop the spaces around the dot.
          <span key={detail} className="whitespace-pre-wrap text-fg-muted">
            {chip === "" && index === 0 ? "" : " · "}
            {detail}
          </span>
        ))}
      </p>
    </div>
  );
}

/**
 * The Queue tab (HAL-17515 P18–P22, requirement `team.merge-queue`): the health band, then one
 * bordered list with a header row per group as it builds and one for the PRs waiting to enter,
 * then those taken out today. Positions are the queue's own; no time to merge is ever guessed.
 */
export function QueueTab(props: { view: QueueView | undefined; clock: TeamClock }) {
  const { view, clock } = props;
  if (view === undefined || (view.total === 0 && view.takenOut.length === 0)) {
    return (
      <Note>
        {mergeQueueWords.empty} {mergeQueueWords.emptyHint}
      </Note>
    );
  }
  const queueRows = (rows: readonly PullRequestRow[]) =>
    rows.map((row) => <QueueRow key={row.pullRequest.id} row={row} clock={clock} />);
  return (
    <>
      <QueueHealth view={view} where="queue" />
      {view.groups.length > 0 || view.waiting.length > 0 ? (
        <ul aria-label={mergeQueueWords.tabs.queue} className={listBox}>
          {view.groups.map((group) => (
            <Fragment key={group.position}>
              <GroupHeaderRow group={group} clock={clock} />
              {queueRows(group.rows)}
            </Fragment>
          ))}
          {view.waiting.length > 0 ? (
            <>
              <QueueHeaderRow name={mergeQueueWords.waiting} />
              {queueRows(view.waiting)}
            </>
          ) : null}
        </ul>
      ) : null}
      {view.total > 0 ? <p className="text-small text-fg-muted">{mergeQueueWords.hint}</p> : null}
      {view.takenOut.length > 0 ? (
        <Section name={mergeQueueWords.takenOut(view.takenOut.length)} detail={undefined}>
          <ul className={listBox}>
            {view.takenOut.map((each) => (
              <TakenOutRow key={each.pullRequest.id} takenOut={each} clock={clock} />
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}
