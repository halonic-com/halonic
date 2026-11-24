import { useEffect, useSyncExternalStore } from "react";
import type { Blocker, OverviewAgent, OverviewWork } from "../overview.ts";
import type { OverviewStore } from "../overview-store.ts";

/** Props for {@link OverviewView}. */
export interface OverviewViewProps {
  readonly store: OverviewStore;
}

/**
 * The overview: each agent with its source, what it is doing and the work it
 * holds, idle agents marked, then the blocked work with what it waits on.
 * Every name and title is agent-written, so it is drawn as plain text only.
 */
export function OverviewView({ store }: OverviewViewProps) {
  useEffect(() => {
    void store.start();
    return () => store.stop();
  }, [store]);
  const state = useSyncExternalStore(store.subscribe, store.snapshot);

  if (state.kind === "loading") return <p className="px-4 py-3 text-fg-muted">Loading…</p>;
  if (state.kind === "failed") {
    return <p className="px-4 py-3 text-fg-danger">The overview couldn't be read.</p>;
  }
  const { agents, blocked } = state.overview;
  return (
    <div className="flex flex-col gap-4 px-4 py-3">
      <section aria-labelledby="overview-agents">
        <h2 id="overview-agents" className="text-heading">
          Agents
        </h2>
        {agents.length === 0 ? <p className="text-fg-muted">No agents yet.</p> : null}
        <ul>
          {agents.map((agent) => (
            <AgentRow key={agent.id} agent={agent} />
          ))}
        </ul>
      </section>
      <section aria-labelledby="overview-blocked">
        <h2 id="overview-blocked" className="text-heading">
          Blocked
        </h2>
        {blocked.length === 0 ? <p className="text-fg-muted">Nothing is blocked.</p> : null}
        <ul>
          {blocked.map((work) => (
            <BlockedRow key={work.id} work={work} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function AgentRow({ agent }: { readonly agent: OverviewAgent }) {
  return (
    <li data-agent={agent.id} className="py-2">
      <p>
        <span className="font-medium">{agent.name}</span>
        {agent.title === undefined ? null : (
          <span className="text-fg-muted">{` · ${agent.title}`}</span>
        )}
        <span className="text-small text-fg-muted">{` · ${agent.sourceLabel}`}</span>
      </p>
      <p className="text-small text-fg-muted">
        {agent.idle ? "Idle" : activityWords[agent.activity]}
      </p>
      {agent.work.length === 0 ? null : (
        <ul className="ps-4">
          {agent.work.map((work) => (
            <li key={work.id}>{workLine(work)}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

function BlockedRow({ work }: { readonly work: OverviewWork }) {
  return (
    <li data-work={work.id} className="py-2">
      <p>{workLine(work)}</p>
      {work.blockedBy.length === 0 ? null : (
        <p className="text-small text-fg-muted">{`Waits on ${work.blockedBy.map(blockerLine).join(", ")}`}</p>
      )}
    </li>
  );
}

const activityWords: Readonly<Record<OverviewAgent["activity"], string>> = {
  idle: "Idle",
  working: "Working",
  waiting: "Waiting",
  paused: "Paused",
  other: "Busy",
};

function workLine(work: OverviewWork): string {
  return `${work.label} ${work.title}`;
}

/** A blocker the source doesn't list reads as "work this source doesn't show". */
function blockerLine(blocker: Blocker): string {
  if (blocker.label === undefined) return "work this source doesn't show";
  return `${blocker.label} ${blocker.title ?? ""}`.trim();
}
