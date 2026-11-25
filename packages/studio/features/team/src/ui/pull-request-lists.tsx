import { Button, Tabs } from "@halonicjs/studio-kit";
import { useEffect, useRef, useState } from "react";
import type { QueueView } from "../merge-queue.ts";
import { mergeQueueWords } from "../merge-queue-words.ts";
import { pullRequestWords } from "../pull-request-words.ts";
import type { PullRequestRow } from "../pull-requests.ts";
import type { TeamClock } from "../team-format.ts";
import { QueueHealth, QueueTab } from "./merge-queue-tab.tsx";
import { MergedToday } from "./merged-today.tsx";
import { Note, RowList, Section } from "./pr-list-parts.tsx";
import type { WebLinkOpener } from "./pull-request-row.tsx";

type Tab = "attention" | "open" | "queue" | "merged";

/** Failing and conflicting first, then the oldest waits. */
function worstFirst(a: PullRequestRow, b: PullRequestRow): number {
  const rank = (row: PullRequestRow) =>
    row.stuck.includes("failing") || row.stuck.includes("conflicting") ? 0 : 1;
  return rank(a) - rank(b) || Date.parse(a.pullRequest.since) - Date.parse(b.pullRequest.since);
}

/**
 * Needs attention, All open, Queue and Merged today as the kit's tabs, each with its count: the
 * selected list is shown by more than colour, read as selected, and moved through with the arrow
 * keys. Every tab but Queue starts with the queue's health line (HAL-17515 P1).
 */
export function PullRequestLists(props: {
  rows: readonly PullRequestRow[];
  merged: readonly PullRequestRow[];
  queue: QueueView | undefined;
  clock: TeamClock;
  opener: WebLinkOpener;
}) {
  const [tab, setTab] = useState<Tab>("attention");
  const tabList = useRef<HTMLDivElement>(null);
  // See all open removes itself, so focus moves to the All open tab instead of the page.
  const focusAllOpen = useRef(false);
  useEffect(() => {
    if (!focusAllOpen.current) return;
    focusAllOpen.current = false;
    tabList.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
  });
  const seeAllOpen = () => {
    focusAllOpen.current = true;
    setTab("open");
  };
  const stuck = props.rows.filter((row) => row.stuck.length > 0).sort(worstFirst);
  const tabs = [
    { id: "attention", label: pullRequestWords.tabs.attention, count: counted(stuck.length) },
    { id: "open", label: pullRequestWords.tabs.open, count: counted(props.rows.length) },
    { id: "queue", label: mergeQueueWords.tabs.queue, count: counted(props.queue?.total ?? 0) },
    { id: "merged", label: mergeQueueWords.tabs.merged, count: counted(props.merged.length) },
  ] as const;
  const coming = comingUp(props.rows);
  // The rows no state group names have no heading.
  const allOpenGroup = (title: string, rows: readonly PullRequestRow[]) => {
    if (title !== "") return section(title, String(rows.length), rows);
    return <RowList key="rest" rows={rows} clock={props.clock} opener={props.opener} />;
  };
  const section = (name: string, detail: string | undefined, rows: readonly PullRequestRow[]) => (
    <Section key={name} name={name} detail={detail}>
      <RowList rows={rows} clock={props.clock} opener={props.opener} />
    </Section>
  );
  return (
    <div ref={tabList}>
      <Tabs label={pullRequestWords.listsLabel} tabs={tabs} selected={tab} onSelect={setTab}>
        <div className="flex flex-col gap-2">
          {tab !== "queue" && props.queue !== undefined ? (
            <QueueHealth view={props.queue} where="list" />
          ) : null}
          {props.rows.length === 0 && (tab === "attention" || tab === "open") ? (
            <Note>{pullRequestWords.noOpen}</Note>
          ) : null}
          {props.rows.length > 0 && tab === "attention" ? (
            <>
              {stuck.length === 0 ? (
                <Section name={pullRequestWords.stuck} detail={undefined}>
                  <Note action={<SeeAllOpen onPress={seeAllOpen} />}>
                    {pullRequestWords.nothingStuck(props.rows.length)}
                  </Note>
                </Section>
              ) : (
                section(pullRequestWords.stuck, pullRequestWords.worstFirst, stuck)
              )}
              {coming.length > 0 ? section(pullRequestWords.comingUp, undefined, coming) : null}
            </>
          ) : null}
          {tab === "open"
            ? byState(props.rows).map(([title, rows]) => allOpenGroup(title, rows))
            : null}
          {tab === "queue" ? <QueueTab view={props.queue} clock={props.clock} /> : null}
          {tab === "merged" ? (
            <MergedToday rows={props.merged} clock={props.clock} opener={props.opener} />
          ) : null}
        </div>
      </Tabs>
    </div>
  );
}

/** A tab's count: the number on the chip, and the same number for screen readers. */
function counted(value: number) {
  return { value, name: String(value) };
}

function SeeAllOpen({ onPress }: { onPress: () => void }) {
  return (
    <Button variant="secondary" size="sm" onClick={onPress}>
      {pullRequestWords.seeAllOpen}
    </Button>
  );
}

/** PRs on their way in that aren't stuck: approved, then the queue in its order. */
function comingUp(rows: readonly PullRequestRow[]): readonly PullRequestRow[] {
  const place = (row: PullRequestRow) => row.pullRequest.queue?.position ?? 0;
  return rows
    .filter((row) => row.stuck.length === 0)
    .filter((row) => row.pullRequest.state === "approved" || row.pullRequest.state === "in-queue")
    .sort((a, b) => place(a) - place(b));
}

/** All open's groups in the state table's order, each with its rows; empty groups left out. */
function byState(rows: readonly PullRequestRow[]): readonly [string, readonly PullRequestRow[]][] {
  const groups = pullRequestWords.groups.map(
    ([state, title]): [string, readonly PullRequestRow[]] => [
      title,
      rows.filter((row) => row.pullRequest.state === state),
    ],
  );
  const named = new Set<string>(pullRequestWords.groups.map(([state]) => state));
  const rest = rows.filter((row) => !named.has(row.pullRequest.state));
  return [...groups, ["", rest] as [string, readonly PullRequestRow[]]].filter(
    ([, each]) => each.length > 0,
  );
}
