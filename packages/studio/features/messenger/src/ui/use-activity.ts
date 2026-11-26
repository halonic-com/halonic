import type { MessagingId, PullRequestList, TeamRuns, WorkItem } from "@halonicjs/ports";
import { useCallback, useEffect, useRef, useState } from "react";
import { type ActivityView, activityView } from "../activity.ts";
import { type EarlierRun, earlierToday, type NextTask, nextFor } from "../activity-today.ts";
import type { ConversationRow, Messenger } from "../messenger.ts";

/** What the reads of the activity brought: none yet, or the newest runs, pull requests and work. */
export interface ActivityReads {
  readonly read:
    | { readonly runs: readonly TeamRuns[]; readonly pulls: readonly PullRequestList[] }
    | undefined;
  readonly work: readonly WorkItem[];
  readonly failure: unknown;
  readonly readNow: () => void;
}

/** How often the panel reads while open, and while closed for the header button's dot. */
const readEveryMs = { open: 15_000, closed: 30_000 };

/** What the panel last read: nothing yet, the agent's activity, and whether the newest read failed. */
export interface ActivityRead {
  readonly view: ActivityView | undefined;
  /** Today's earlier runs, for an idle agent's **Earlier today**. */
  readonly earlier: readonly EarlierRun[];
  /** The open tasks the agent holds, for **Next**. */
  readonly next: readonly NextTask[];
  readonly failure: unknown;
  readonly read: () => void;
}

/**
 * The open chat's agent's activity (`messenger.activity-panel`): its runs since local midnight,
 * the pull requests and the work it holds, read every 15 seconds while the panel is open and every
 * 30 while it is closed, so the header button's dot stays right. A failed read keeps what was read
 * last. The work is read on its own: when only that read fails, **Next** is empty and the rest
 * still shows (HAL-18567 review). The view is worked out on each render, so a new list read (this
 * chat's `agentWorking`) shows at once.
 */
export function useActivity(
  messenger: Messenger,
  row: ConversationRow,
  open: boolean,
): ActivityRead {
  const reads = useActivityReads(messenger, [row.conversation.agent], open);
  return activityFor(reads, row, messenger.now());
}

/**
 * Reads the activity of `agents`: one chat's agent, or a channel's agents, as `useActivity` says.
 */
export function useActivityReads(
  messenger: Messenger,
  agents: readonly MessagingId[],
  open: boolean,
): ActivityReads {
  // The same agents in a new array mustn't start a new read.
  const agentsKey = agents.join("\n");
  const activity = messenger.activity;
  const [read, setRead] = useState<ActivityReads["read"]>(undefined);
  const [work, setWork] = useState<readonly WorkItem[]>([]);
  const [failure, setFailure] = useState<unknown>(undefined);
  // Counts the reads, so an answer that lands after a newer read's never shows.
  const reads = useRef(0);
  const readNow = useCallback(() => {
    if (activity === undefined) return;
    reads.current += 1;
    const thisRead = reads.current;
    const since = startOfToday(messenger.now()).toISOString();
    const runs = readRuns(activity, agentsKey.split("\n"), since);
    Promise.all([runs, activity.pullRequests()]).then(
      ([runs, pulls]) => {
        if (thisRead !== reads.current) return;
        setRead({ runs, pulls });
        setFailure(undefined);
      },
      (error: unknown) => {
        console.error("The Messenger couldn't read the agent's activity:", error);
        if (thisRead === reads.current) setFailure(error);
      },
    );
    messenger.work().then(
      (items) => {
        if (thisRead === reads.current) setWork(items);
      },
      (error: unknown) => {
        console.error("The Messenger couldn't read the agent's tasks:", error);
        if (thisRead === reads.current) setWork([]);
      },
    );
  }, [activity, messenger, agentsKey]);

  useEffect(() => {
    readNow();
    const every = setInterval(readNow, open ? readEveryMs.open : readEveryMs.closed);
    return () => clearInterval(every);
  }, [readNow, open]);
  return { read, work, failure, readNow };
}

/** What the panel shows of `row`'s agent from the reads. */
export function activityFor(reads: ActivityReads, row: ConversationRow, now: Date): ActivityRead {
  const { read, work, failure, readNow } = reads;
  const agent = row.conversation.agent;
  if (read === undefined) return { view: undefined, earlier: [], next: [], failure, read: readNow };
  const view = activityView(row, read.runs, read.pulls, now);
  const shown = view.kind === "idle" ? undefined : view.task;
  return {
    view,
    earlier: earlierToday(agent, read.runs, shown?.runId),
    next: nextFor(agent, work, shown?.taskId),
    failure,
    read: readNow,
  };
}

/**
 * The runs of `agents` since `since`. One agent's are read on their own; several agents' are read
 * in one call, the workspace's newest runs, unless a source says that call left some out: then
 * each agent's are read on its own, so a busy day never shows a working agent as Idle (HAL-18567
 * review).
 */
async function readRuns(
  activity: NonNullable<Messenger["activity"]>,
  agents: readonly MessagingId[],
  since: string,
): Promise<readonly TeamRuns[]> {
  const [only, ...others] = agents;
  if (only !== undefined && others.length === 0) return activity.runs({ agent: only, since });
  const all = await activity.runs({ since });
  if (all.every((each) => each.complete)) return all;
  const each = await Promise.all(agents.map((agent) => activity.runs({ agent, since })));
  return each.flat();
}

function startOfToday(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
