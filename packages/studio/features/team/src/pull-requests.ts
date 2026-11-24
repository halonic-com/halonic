import type {
  AgentMessaging,
  MergeQueue,
  PullRequest,
  PullRequestList,
  TeamStatus,
  WorkItem,
} from "@halonicjs/ports";
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
    };

/**
 * The Pull requests screen's reads (requirement `team.pull-request-stuck`): the
 * first `TeamStatus` source that serves pull requests, its first repo's open
 * PRs with why each is stuck, and their tasks from `AgentMessaging` when a
 * workspace has it. It holds no copy; each read asks the ports again.
 */
export class PullRequests {
  /** Absent where no engine serves `TeamStatus`: the screen says PR states aren't available. */
  private readonly team: TeamStatus | undefined;
  /** Absent where no engine serves messaging: rows then name no task. */
  private readonly messaging: AgentMessaging | undefined;
  private readonly clock: TeamClock;

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
    return { kind: "read", repo: list.repo, asOf: list.asOf, rows: this.rows(list, queue, work) };
  }

  /** Calls `listener` whenever a source says its team status changed. Returns a function that stops it. */
  watch(listener: () => void): () => void {
    return watchTeamStatus(this.team, listener, "Pull requests");
  }

  private rows(
    list: PullRequestList,
    queue: MergeQueue | undefined,
    work: readonly WorkItem[],
  ): readonly PullRequestRow[] {
    const now = this.clock.now();
    const inQueue = list.open.filter((each) => each.state === "in-queue").length;
    return list.open.map((pullRequest) => {
      const task = work.find((each) => each.id === pullRequest.work);
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
