import { LetterTile } from "@halonicjs/studio-kit";
import { type ReactNode, useId } from "react";
import {
  type AgentListing,
  type AgentSettings,
  type AgentStep,
  type AgentTeamMember,
  type AgentToolList,
  type AgentToolOption,
  type AgentUser,
  agentToolLists,
} from "../api.ts";
import { MapFrame } from "./map-frame.tsx";
import type { MapSide } from "./map-geometry.ts";
import { mapWords as words } from "./map-words.ts";

/** Props for {@link AgentMap}. */
export interface AgentMapProps {
  readonly settings: AgentSettings;
  /** Every agent of its hub with the agents each hands work to, for both of its sides. */
  readonly team: readonly AgentTeamMember[];
  /** The Library items its hub can use, for the tools' names. */
  readonly tools: Readonly<Record<AgentToolList, readonly AgentToolOption[]>>;
  /** The workflows that run it. */
  readonly users: readonly AgentUser[];
  readonly openAgentStep: (step: AgentStep) => void;
  readonly openSubagent: (agent: AgentListing) => void;
  /** Opens another agent's page, for one that hands it work; absent leaves its card as text. */
  readonly openAgent?: ((agent: AgentListing) => void) | undefined;
  /** Opens a workflow's page; absent leaves its card as text. */
  readonly openWorkflow?: ((workflow: AgentUser) => void) | undefined;
  /** Opens Library on a Tools list; absent leaves the tools' cards as text. */
  readonly openTool?: ((list: AgentToolList) => void) | undefined;
  /** Opens Configuration › Triggers; absent until a feature adds Triggers, which hides the button. */
  readonly addTrigger?: (() => void) | undefined;
  readonly addTool: () => void;
  readonly addSubagent: () => void;
}

const cardClasses =
  "flex w-full flex-col items-start gap-0.5 rounded-md border border-border bg-surface-raised px-3 py-2 text-start text-small text-fg";
const pressableClasses = `${cardClasses} hover:bg-surface-subtle focus-ring`;
const addClasses =
  "w-full rounded-md border border-dashed border-border px-3 py-2 text-start text-small text-fg-muted hover:bg-surface-subtle focus-ring";

/**
 * The agent map (`agents.map.layout-by-side`, flow-agents 6): the agent in the centre with its
 * agent steps; on the left what brings it work (the workflows that run it and the agents that
 * hand it work), below what it can use (skills, knowledge, connectors, three a row), and on the
 * right who it hands work to. Each side is a group named by its heading and ends in its add
 * button (`agents.map.add-button-per-side`). The DOM order is the reading order, left, centre,
 * below, right, so Tab goes card to card that way. Its frame fits it to the panel and joins the
 * cards to the centre with curved lines (`agents.map.lines-and-fit`).
 */
export function AgentMap(props: AgentMapProps) {
  const { settings, team, users, openAgentStep, openSubagent, openAgent, openWorkflow } = props;
  const handsWork = team.filter(
    (member) => member.id !== settings.id && member.subagents.includes(settings.id),
  );
  const subagents = settings.subagents.flatMap((id) => team.filter((member) => member.id === id));
  const workIn = users.length + handsWork.length > 0 || props.addTrigger !== undefined;
  return (
    <MapFrame label={words.map(settings.name)}>
      <div className="col-start-1 row-start-1">
        {workIn && (
          <Side heading={words.workIn} side="in">
            {users.map((user) => (
              <Card
                key={`${user.hubId}/${user.id}`}
                label={words.workflowCard(user.name, settings.name, user.steps)}
                onOpen={openWorkflow && (() => openWorkflow(user))}
              >
                <Kind>{words.workflow}</Kind>
                <span>{user.name}</span>
                <span className="text-caption text-fg-muted">{words.steps(user.steps)}</span>
              </Card>
            ))}
            {handsWork.map((member) => (
              <AgentCard key={member.id} agent={member} onOpen={openAgent} />
            ))}
            {props.addTrigger && <AddButton label={words.addTrigger} onAdd={props.addTrigger} />}
          </Side>
        )}
      </div>
      <CentreCard settings={settings} openAgentStep={openAgentStep} />
      <div className="col-span-3 row-start-2">
        <Side heading={words.canUse} side="use" columns>
          <ToolCards {...props} />
          <AddButton label={words.addTool} onAdd={props.addTool} />
        </Side>
      </div>
      <div className="col-start-3 row-start-1">
        <Side heading={words.workOut} side="out">
          {subagents.map((member) => (
            <AgentCard key={member.id} agent={member} onOpen={openSubagent} />
          ))}
          <AddButton label={words.addSubagent} onAdd={props.addSubagent} />
        </Side>
      </div>
    </MapFrame>
  );
}

/** The agent itself: its avatar and name, which open nothing, and its agent steps, each a card. */
function CentreCard({
  settings,
  openAgentStep,
}: Pick<AgentMapProps, "settings" | "openAgentStep">) {
  const stepsId = useId();
  return (
    <div
      data-map-centre=""
      className="col-start-2 row-start-1 flex flex-col gap-2 rounded-lg border border-border-strong bg-surface-raised p-4"
    >
      <p className="flex items-center gap-2 text-body-strong text-fg">
        <LetterTile name={settings.name} />
        {settings.name}
      </p>
      {settings.agentSteps.length > 0 && (
        // biome-ignore lint/a11y/useSemanticElements: a list of links, not form fields, so not a fieldset.
        <div role="group" aria-labelledby={stepsId} className="flex flex-col gap-1">
          <p id={stepsId} className="text-caption text-fg-muted">
            {words.agentSteps}
          </p>
          <ul className="flex flex-col gap-1">
            {settings.agentSteps.map((step) => (
              <li key={step.id}>
                <button
                  type="button"
                  className="text-small text-fg underline-offset-2 hover:underline focus-ring"
                  onClick={() => openAgentStep(step)}
                >
                  {step.id} ›
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The skills, knowledge and connectors it uses, by name, in the Tools page's order. */
function ToolCards({ settings, tools, openTool }: AgentMapProps) {
  return agentToolLists.flatMap((list) =>
    settings[list].map((id) => (
      <Card key={`${list}/${id}`} onOpen={openTool && (() => openTool(list))}>
        <Kind>{words.kinds[list]}</Kind>
        <span>{tools[list].find((option) => option.id === id)?.name ?? id}</span>
      </Card>
    )),
  );
}

/** One side of the map: a group named by its heading, its cards in a list. */
function Side({
  heading,
  side,
  columns = false,
  children,
}: {
  readonly heading: string;
  /** Which side it is, for the lines to its cards. */
  readonly side: MapSide;
  /** Three a row, for what it can use; one under the other otherwise. */
  readonly columns?: boolean;
  readonly children: ReactNode;
}) {
  const headingId = useId();
  return (
    // biome-ignore lint/a11y/useSemanticElements: a side of cards, not form fields, so not a fieldset.
    <div
      role="group"
      aria-labelledby={headingId}
      data-map-side={side}
      className="flex flex-col gap-2"
    >
      <h2 id={headingId} className="text-caption text-fg-muted uppercase">
        {heading}
      </h2>
      <div className={columns ? "grid grid-cols-3 gap-2" : "flex flex-col gap-2"}>{children}</div>
    </div>
  );
}

/** A card of the map: a button that opens its item, or text where the app can't open it. */
function Card({
  label,
  onOpen,
  children,
}: {
  /** Its accessible name, when its text doesn't say enough. */
  readonly label?: string;
  readonly onOpen?: (() => void) | undefined;
  readonly children: ReactNode;
}) {
  if (onOpen === undefined) {
    return (
      <div data-map-card="" className={cardClasses}>
        {children}
      </div>
    );
  }
  return (
    <button
      type="button"
      data-map-card=""
      aria-label={label}
      className={pressableClasses}
      onClick={onOpen}
    >
      {children}
    </button>
  );
}

/** Another agent of the hub, on either side. */
function AgentCard({
  agent,
  onOpen,
}: {
  readonly agent: AgentListing;
  readonly onOpen?: ((agent: AgentListing) => void) | undefined;
}) {
  return (
    <Card onOpen={onOpen && (() => onOpen(agent))}>
      <Kind>{words.agent}</Kind>
      <span>{agent.name}</span>
    </Card>
  );
}

/** What kind of item a card is, in small caps; read before its name. */
function Kind({ children }: { readonly children: string }) {
  return <span className="text-caption text-fg-muted uppercase">{children} </span>;
}

/** The add button a side ends in, also when the side is empty. */
function AddButton({ label, onAdd }: { readonly label: string; readonly onAdd: () => void }) {
  return (
    <button type="button" className={addClasses} onClick={onAdd}>
      <span aria-hidden="true">+ </span>
      {label}
    </button>
  );
}
