import type {
  AgentActivity,
  MessagingAgent,
  MessagingId,
  MessagingSource,
  WorkItem,
  WorkState,
} from "@halonicjs/ports";

/** What blocks a piece of work, as the overview shows it. */
export interface Blocker {
  readonly id: MessagingId;
  /** What people call it, such as `HAL-10`, or `undefined` when the source doesn't list it. */
  readonly label: string | undefined;
  readonly title: string | undefined;
}

/** A piece of work as the overview shows it, with what blocks it resolved. */
export interface OverviewWork {
  readonly id: MessagingId;
  readonly label: string;
  readonly title: string;
  readonly state: WorkState;
  readonly blockedBy: readonly Blocker[];
}

/** One agent with its source's label and the work it holds. */
export interface OverviewAgent {
  readonly id: MessagingId;
  readonly name: string;
  readonly title: string | undefined;
  readonly sourceLabel: string;
  readonly activity: AgentActivity;
  /** Idle when it says so, or when it holds no open work. */
  readonly idle: boolean;
  readonly work: readonly OverviewWork[];
}

/** Everything the overview page shows. */
export interface Overview {
  readonly agents: readonly OverviewAgent[];
  /** Open work that waits on something, from every agent and from nobody. */
  readonly blocked: readonly OverviewWork[];
}

/** What {@link buildOverview} reads, as `AgentMessaging` gives it. */
export interface OverviewInput {
  readonly sources: readonly MessagingSource[];
  readonly agents: readonly MessagingAgent[];
  readonly work: readonly WorkItem[];
}

const closedStates: ReadonlySet<WorkState> = new Set(["done", "cancelled"]);

/**
 * Builds the overview (requirement `overview.agents-and-work`): each agent
 * under its source's label with the open work it holds, idle agents marked,
 * and blocked work with the label and title of what it waits on. Agents are
 * told apart by ID, never by name, so two sources' agents with one name stay
 * two rows.
 */
export function buildOverview(input: OverviewInput): Overview {
  const sourceLabels = new Map(input.sources.map((source) => [source.id, source.label]));
  const workById = new Map(input.work.map((item) => [item.id, item]));
  const open = input.work.filter((item) => !closedStates.has(item.state));
  const shown = open.map((item) => overviewWork(item, workById));

  const agents = input.agents.map((agent): OverviewAgent => {
    const work = shown.filter((_, index) => open[index]?.assignee === agent.id);
    return {
      id: agent.id,
      name: agent.name,
      title: agent.title,
      sourceLabel: sourceLabels.get(agent.source) ?? "",
      activity: agent.activity,
      idle: agent.activity === "idle" || work.length === 0,
      work,
    };
  });
  const blocked = shown.filter((item) => item.state === "blocked" || item.blockedBy.length > 0);
  return { agents, blocked };
}

function overviewWork(item: WorkItem, workById: ReadonlyMap<MessagingId, WorkItem>): OverviewWork {
  return {
    id: item.id,
    label: item.label,
    title: item.title,
    state: item.state,
    blockedBy: item.blockedBy.map((id): Blocker => {
      const blocker = workById.get(id);
      return { id, label: blocker?.label, title: blocker?.title };
    }),
  };
}
