import type { AgentRef, AgentTeamMember } from "../api.ts";
import { pageWords } from "./page-words.ts";

/** Props for {@link TeamChart}. */
export interface TeamChartProps {
  /** The agents of the hub with the agents each hands work to. */
  readonly team: readonly AgentTeamMember[];
  /** The agent the chart is about. */
  readonly agent: AgentRef;
  /** Opens another agent's page; absent where the app can't, which leaves the names as text. */
  readonly openAgent?: ((agent: AgentRef) => void) | undefined;
}

/**
 * The team chart (`agents.editor.team-chart`, flow-agents 5.4): the agent as the larger card in the
 * middle, the agents that hand it work above it and the agents it hands work to below it, each with
 * only its link to this agent. Nothing shows while the agent works alone. Another agent opens its
 * page; the agent itself is not a link.
 */
export function TeamChart({ team, agent, openAgent }: TeamChartProps) {
  const self = team.find((member) => member.id === agent.id);
  if (self === undefined) return null;
  const above = team.filter(
    (member) => member.id !== agent.id && member.subagents.includes(agent.id),
  );
  const below = self.subagents.flatMap((id) => team.filter((member) => member.id === id));
  if (above.length === 0 && below.length === 0) return null;
  return (
    <section
      aria-label={pageWords.teamChart(self.name)}
      className="flex flex-col items-center gap-2 px-4 pt-4"
    >
      {above.length > 0 && (
        <>
          <TeamRow members={above} openAgent={openAgent} />
          <Link />
        </>
      )}
      <p
        aria-current="true"
        className="rounded-md border border-border-strong bg-surface-raised px-4 py-2 text-body-strong text-fg"
      >
        {self.name}
      </p>
      {below.length > 0 && (
        <>
          <Link />
          <TeamRow members={below} openAgent={openAgent} />
        </>
      )}
    </section>
  );
}

/** A row of the chart's smaller cards. */
function TeamRow({
  members,
  openAgent,
}: {
  readonly members: readonly AgentTeamMember[];
  readonly openAgent: ((agent: AgentRef) => void) | undefined;
}) {
  return (
    <ul className="flex flex-wrap justify-center gap-2">
      {members.map((member) => (
        <li key={member.id}>
          {openAgent === undefined ? (
            <span className="block rounded-md border border-border px-3 py-1 text-small text-fg">
              {member.name}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => openAgent(member)}
              className="rounded-md border border-border px-3 py-1 text-small text-fg hover:bg-surface-subtle focus-ring"
            >
              {member.name}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** The line between a row and the agent; it says nothing a screen reader needs. */
function Link() {
  return <span aria-hidden="true" className="h-3 w-px bg-border-strong" />;
}
