import { mergeQueueWords } from "../merge-queue-words.ts";
import type { PullRequestRow } from "../pull-requests.ts";
import type { TeamClock } from "../team-format.ts";
import { Note, RowList, Section } from "./pr-list-parts.tsx";
import type { WebLinkOpener } from "./pull-request-row.tsx";

/**
 * The Merged today tab (HAL-17515 P6, requirement `team.merge-queue`): the PRs merged in the last
 * day, newest first, each with "Merged 14:20" in place of its state.
 */
export function MergedToday(props: {
  rows: readonly PullRequestRow[];
  clock: TeamClock;
  opener: WebLinkOpener;
}) {
  if (props.rows.length === 0) return <Note>{mergeQueueWords.noneMerged}</Note>;
  return (
    <Section name={mergeQueueWords.merged} detail={mergeQueueWords.newestFirst}>
      <RowList rows={props.rows} clock={props.clock} opener={props.opener} />
    </Section>
  );
}
