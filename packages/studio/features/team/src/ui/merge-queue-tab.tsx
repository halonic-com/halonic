import { StatusChip, type StatusChipTone } from "@halonicjs/studio-kit";
import type { QueueGroup, QueueView, TakenOut } from "../merge-queue.ts";
import { mergeQueueWords } from "../merge-queue-words.ts";
import { formatTime, minutesSince, type TeamClock } from "../team-format.ts";
import { listBox, Note, RowList, Section } from "./pr-list-parts.tsx";
import { authorName, type WebLinkOpener } from "./pull-request-row.tsx";

/** The health chip's tone: amber while pushes wait, red once the queue has stopped. */
const healthTones: Record<QueueView["health"], StatusChipTone> = {
  running: "success",
  "runners-busy": "attention",
  stopped: "danger",
  empty: "neutral",
  other: "neutral",
};

/**
 * The queue's health in one line (HAL-17515 P1 under the list tabs, P18 on the Queue tab):
 * "Merge queue: Running · 7 PRs · group 2 of 3 building · no runner wait". The state is a chip
 * with its word, never colour alone.
 */
export function QueueHealth(props: { view: QueueView; where: "list" | "queue" }) {
  const { chip, details } = mergeQueueWords.health(props.view, props.where);
  return (
    <p className="mt-1 flex flex-wrap items-center gap-y-1 text-small">
      {props.where === "list" && props.view.health !== "empty" ? (
        <span className="mr-1 text-fg-muted">{mergeQueueWords.linePrefix}</span>
      ) : null}
      {chip === "" ? null : <StatusChip tone={healthTones[props.view.health]}>{chip}</StatusChip>}
      {details.map((detail, index) => (
        // Kept as written: a flex row would drop the spaces around the dot.
        <span key={detail} className="whitespace-pre-wrap text-fg-muted">
          {chip === "" && index === 0 ? "" : " · "}
          {detail}
        </span>
      ))}
    </p>
  );
}

/**
 * The Queue tab (HAL-17515 P18–P22, requirement `team.merge-queue`): the health line, the groups
 * as they build, the PRs waiting to enter, and those taken out today. Positions are the queue's
 * own; no time to merge is ever guessed.
 */
export function QueueTab(props: {
  view: QueueView | undefined;
  clock: TeamClock;
  opener: WebLinkOpener;
}) {
  const { view, clock, opener } = props;
  if (view === undefined || (view.total === 0 && view.takenOut.length === 0)) {
    return (
      <Note>
        {mergeQueueWords.empty} {mergeQueueWords.emptyHint}
      </Note>
    );
  }
  return (
    <>
      <QueueHealth view={view} where="queue" />
      {view.groups.map((group) => (
        <GroupSection key={group.position} group={group} clock={clock} opener={opener} />
      ))}
      {view.waiting.length > 0 ? (
        <Section name={mergeQueueWords.waiting} detail={undefined}>
          <RowList rows={view.waiting} clock={clock} opener={opener} />
        </Section>
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

/** A group's heading words: "Group 2 · Building · 9 min", or "Group failed: #5655 · …". */
function groupHeading(group: QueueGroup, clock: TeamClock): { name: string; detail?: string } {
  if (group.state === "passed") {
    return { name: mergeQueueWords.group(group.position), detail: mergeQueueWords.passed };
  }
  if (group.state === "building") {
    const minutes = minutesSince(group.since, clock);
    return {
      name: mergeQueueWords.group(group.position),
      detail: mergeQueueWords.building(minutes),
    };
  }
  const name = mergeQueueWords.groupFailed(group.culprit?.pullRequest.label);
  if (group.behind === 0) return { name };
  return { name, detail: mergeQueueWords.testedAgain(group.behind) };
}

/** One group under its heading, with its PRs, and for a failed one the PR named as the cause. */
function GroupSection(props: { group: QueueGroup; clock: TeamClock; opener: WebLinkOpener }) {
  const { group, clock } = props;
  const { name, detail } = groupHeading(group, clock);
  return (
    <Section name={name} detail={detail}>
      {group.culprit === undefined ? null : (
        <p className="pb-2 text-small text-fg-muted">
          {mergeQueueWords.culprit(
            group.culprit.pullRequest.label,
            formatTime(group.culprit.at, clock),
          )}
        </p>
      )}
      {group.rows.length > 0 ? (
        <RowList rows={group.rows} clock={clock} opener={props.opener} />
      ) : null}
    </Section>
  );
}

/**
 * A PR taken out today: its number and title over the queue session's reason, the time and its
 * author ("Group failed: typecheck · 12:40 · Kim"). The reason and title are plain text.
 */
function TakenOutRow({ takenOut, clock }: { takenOut: TakenOut; clock: TeamClock }) {
  const { pullRequest } = takenOut;
  return (
    <li className="flex flex-col gap-1 px-4 py-3">
      <p className="wrap-anywhere text-body-strong">
        <span className="font-mono text-small text-fg-muted">{pullRequest.label}</span>{" "}
        {pullRequest.title}
      </p>
      <p className="wrap-anywhere text-small text-fg-muted">
        {takenOut.reason} · {formatTime(takenOut.at, clock)} · {authorName(pullRequest.author)}
      </p>
    </li>
  );
}
