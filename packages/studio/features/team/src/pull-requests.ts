import type {
  AgentMessaging,
  MergeQueue,
  MessagingId,
  PullRequest,
  PullRequestEvent,
  PullRequestList,
  TeamStatus,
  WorkItem,
} from "@halonicjs/ports";
import type { PlaceSignal } from "@halonicjs/studio-shell";
import { type QueueView, queueView } from "./merge-queue.ts";
import { ProblemSignal } from "./problem-signal.ts";
import { type StuckReason, stuckReasons } from "./stuck-reasons.ts";
import type { TeamClock } from "./team-format.ts";
import { watchTeamStatus } from "./team-watch.ts";

/** One pull request as a row shows it: the PR, why it's stuck, its task and its queue line. */
export interface PullRequestRow {
  readonly pullRequest: PullRequest;
  /** Empty when it isn't stuck. */
  readonly stuck: readonly StuckReason[];
  /** The task its branch names, when the source knows it. */
  readonly task: WorkItem | undefined;
  /** For a PR in the queue: how many are in it, and how long its group has been building. */
  readonly queue: { readonly total: number; readonly groupSince: string | undefined } | undefined;
}

/** What the One PR page shows: the PR's row, its timeline, and when its source made them. */
export interface PullRequestPage {
  readonly row: PullRequestRow;
  readonly timeline: readonly PullRequestEvent[];
  readonly asOf: string;
}

/**
 * What the Pull requests screen can show: nothing serves pull requests, the
 * connection may not read them, no snapshot has arrived, or one repo's rows.
 */
export type PullRequestsState =
  | { readonly kind: "not-available" }
  | { readonly kind: "no-access" }
  | { readonly kind: "no-snapshot" }
  | {
      readonly kind: "read";
      readonly repo: string;
      readonly asOf: string;
      /** Every open PR, in the source's order. */
      readonly rows: readonly PullRequestRow[];
      /** The PRs merged in the last day, newest first. */
      readonly merged: readonly PullRequestRow[];
      /** The repo's merge queue, when the source sent one. */
      readonly queue: QueueView | undefined;
    };

/**
 * The Pull requests screen's reads (requirement `team.pull-request-stuck`): the
 * first `TeamStatus` source that serves pull requests, its first repo's open
 * PRs with why each is stuck, and their tasks from `AgentMessaging` when a
 * workspace has it. It holds no copy; each read asks the ports again. It
 * keeps only the last stuck count, for the sidebar's signal.
 */
export class PullRequests {
  /** Absent where no engine serves `TeamStatus`: the screen says PR states aren't available. */
  private readonly team: TeamStatus | undefined;
  /** Absent where no engine serves messaging: rows then name no task. */
  private readonly messaging: AgentMessaging | undefined;
  private readonly clock: TeamClock;
  /** The sidebar's count of the stuck PRs. */
  private readonly stuck = new ProblemSignal({
    count: async () => {
      const state = await this.read();
      if (state.kind !== "read") return 0;
      return state.rows.filter((row) => row.stuck.length > 0).length;
    },
    watch: (listener) => this.watch(listener),
    place: "Pull requests",
  });

  constructor(
    team: TeamStatus | undefined,
    messaging: AgentMessaging | undefined,
    clock: TeamClock,
  ) {
    this.team = team;
    this.messaging = messaging;
    this.clock = clock;
  }

  /** The clock the screen formats its times with. */
  get timeClock(): TeamClock {
    return this.clock;
  }

  /** The screen's state now. */
  async read(): Promise<PullRequestsState> {
    const team = this.team;
    if (team === undefined) return { kind: "not-available" };
    const parts = await team.parts();
    const part = parts.find((each) => each.pullRequests);
    if (part === undefined) return { kind: parts.length === 0 ? "not-available" : "no-access" };
    const [lists, queues, work] = await Promise.all([
      team.pullRequests(),
      team.mergeQueue(),
      this.readWork(),
    ]);
    const list = lists.find((each) => each.source === part.source);
    if (list === undefined) return { kind: "no-snapshot" };
    const queue = queues.find((each) => each.source === list.source && each.repo === list.repo);
    const rows = this.rows(list, queue, work);
    return {
      kind: "read",
      repo: list.repo,
      asOf: list.asOf,
      rows,
      merged: mergedRows(list.recent, work),
      queue: queue === undefined ? undefined : queueView(queue, rows, list.recent),
    };
  }

  /**
   * One PR's page (HAL-17515 P12–P17): its row as the lists have it, with its task and queue
   * place, and its timeline, oldest step first. `undefined` when no source knows the PR.
   */
  async detail(id: MessagingId): Promise<PullRequestPage | undefined> {
    if (this.team === undefined) return undefined;
    const [state, detail] = await Promise.all([this.read(), this.team.pullRequest(id)]);
    if (detail === undefined) return undefined;
    const listed =
      state.kind === "read"
        ? [...state.rows, ...state.merged].find((row) => row.pullRequest.id === id)
        : undefined;
    const row: PullRequestRow = {
      stuck: [],
      task: undefined,
      queue: undefined,
      ...listed,
      pullRequest: detail.pullRequest,
    };
    return { row, timeline: detail.timeline, asOf: detail.asOf };
  }

  /** Calls `listener` whenever a source says its team status changed. Returns a function that stops it. */
  watch(listener: () => void): () => void {
    return watchTeamStatus(this.team, listener, "Pull requests");
  }

  /** The sidebar's signal for Pull requests: the stuck PRs, shown as "⚠ 3" (HAL-17515 S0). */
  signal(): PlaceSignal {
    return this.stuck.signal();
  }

  /**
   * Reads now and whenever a source says it changed, and calls `listener`
   * when the stuck count changed. Returns a function that stops it.
   */
  watchSignal(listener: () => void): () => void {
    return this.stuck.watch(listener);
  }

  private rows(
    list: PullRequestList,
    queue: MergeQueue | undefined,
    work: readonly WorkItem[],
  ): readonly PullRequestRow[] {
    const now = this.clock.now();
    const inQueue = list.open.filter((each) => each.state === "in-queue").length;
    return list.open.map((pullRequest) => {
      const task = taskOf(pullRequest, work);
      const blockedByDone =
        task?.blockedBy.some((id) => work.find((each) => each.id === id)?.state === "done") ??
        false;
      const stuckTask = task === undefined ? undefined : { state: task.state, blockedByDone };
      const group = queue?.groups.find((each) => each.position === pullRequest.queue?.group);
      return {
        pullRequest,
        stuck: stuckReasons(pullRequest, now, stuckTask),
        task,
        queue:
          pullRequest.state === "in-queue"
            ? { total: inQueue, groupSince: group?.state === "building" ? group.since : undefined }
            : undefined,
      };
    });
  }

  /** The tasks rows name. Without them rows still show, so a failed read is logged, not thrown. */
  private async readWork(): Promise<readonly WorkItem[]> {
    if (this.messaging === undefined) return [];
    try {
      return await this.messaging.listWork();
    } catch (error) {
      console.error("Pull requests couldn't read the tasks their branches name:", error);
      return [];
    }
  }
}

function taskOf(pullRequest: PullRequest, work: readonly WorkItem[]): WorkItem | undefined {
  return work.find((each) => each.id === pullRequest.work);
}

/** Merged today's rows (HAL-17515 P6): only merged PRs, not closed ones, newest first. */
function mergedRows(
  recent: readonly PullRequest[],
  work: readonly WorkItem[],
): readonly PullRequestRow[] {
  return recent
    .filter((pullRequest) => pullRequest.state === "merged")
    .sort((a, b) => Date.parse(b.since) - Date.parse(a.since))
    .map((pullRequest) => ({
      pullRequest,
      stuck: [],
      task: taskOf(pullRequest, work),
      queue: undefined,
    }));
}
