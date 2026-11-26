import type { PullRequestList, TeamRuns, WorkItem } from "@halonicjs/ports";
import { useCallback, useEffect, useRef, useState } from "react";
import { type ActivityView, activityView } from "../activity.ts";
import { type EarlierRun, earlierToday, type NextTask, nextFor } from "../activity-today.ts";
import type { ConversationRow, Messenger } from "../messenger.ts";

/** What one read of the activity brought. */
interface Reads {
  readonly runs: readonly TeamRuns[];
  readonly pulls: readonly PullRequestList[];
  readonly work: readonly WorkItem[];
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
 * the pull requests and the work it holds, read every 15 seconds while the panel is open and every 30 while it is
 * closed, so the header button's dot stays right. A failed read keeps what was read last. The view
 * is worked out on each render, so a new list read (this chat's `agentWorking`) shows at once.
 */
export function useActivity(
  messenger: Messenger,
  row: ConversationRow,
  open: boolean,
): ActivityRead {
  const activity = messenger.activity;
  const agent = row.conversation.agent;
  const [read, setRead] = useState<Reads | undefined>(undefined);
  const [failure, setFailure] = useState<unknown>(undefined);
  // Counts the reads, so an answer that lands after a newer read's never shows.
  const reads = useRef(0);
  const readNow = useCallback(() => {
    if (activity === undefined) return;
    reads.current += 1;
    const thisRead = reads.current;
    const since = startOfToday(messenger.now()).toISOString();
    Promise.all([activity.runs({ agent, since }), activity.pullRequests(), messenger.work()]).then(
      ([runs, pulls, work]) => {
        if (thisRead !== reads.current) return;
        setRead({ runs, pulls, work });
        setFailure(undefined);
      },
      (error: unknown) => {
        console.error("The Messenger couldn't read the agent's activity:", error);
        if (thisRead === reads.current) setFailure(error);
      },
    );
  }, [activity, messenger, agent]);

  useEffect(() => {
    readNow();
    const every = setInterval(readNow, open ? readEveryMs.open : readEveryMs.closed);
    return () => clearInterval(every);
  }, [readNow, open]);

  if (read === undefined) return { view: undefined, earlier: [], next: [], failure, read: readNow };
  const view = activityView(row, read.runs, read.pulls, messenger.now());
  const shown = view.kind === "idle" ? undefined : view.task;
  return {
    view,
    earlier: earlierToday(agent, read.runs, shown?.runId),
    next: nextFor(agent, read.work, shown?.taskId),
    failure,
    read: readNow,
  };
}

function startOfToday(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
