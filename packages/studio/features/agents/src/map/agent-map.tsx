import { LetterTile } from "@halonicjs/studio-kit";
import type { CloseStack } from "@halonicjs/studio-shell";
import { type ReactNode, useId, useRef, useState } from "react";
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
import { MAX_SIDE_CARDS, SummaryCard, SummaryDrawer } from "./map-summary.tsx";
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
  /** The window's close stack, which Esc on a summary drawer goes through. */
  readonly closeStack: CloseStack;
}

const cardClasses =
  "flex w-full flex-col items-start gap-0.5 rounded-md border border-border bg-surface-raised px-3 py-2 text-start text-small text-fg";
const pressableClasses = `${cardClasses} hover:bg-surface-subtle focus-ring`;
const addClasses =
  "w-full rounded-md border border-dashed border-border-strong px-3 py-2 text-start text-small text-fg-muted hover:bg-surface-subtle focus-ring";

/**
 * The agent map (`agents.map.layout-by-side`, flow-agents 6): the agent in the centre with its
 * agent steps; on the left what brings it work (the workflows that run it and the agents that
 * hand it work), below what it can use (skills, knowledge, connectors, three a row), and on the
 * right who it hands work to. Each side is a group named by its heading and ends in its add
 * button (`agents.map.add-button-per-side`). The DOM order is the reading order, left, centre,
 * below, right, so Tab goes card to card that way. A side with more than three cards shows one
 * summary card instead, which opens a drawer with all of them (`agents.map.side-summary-card`,
 * `agents.map.summary-drawer`). Its frame fits it to the panel and joins the cards to the centre
 * with straight lines (`agents.map.lines-and-fit`).
 */
export function AgentMap(props: AgentMapProps) {
  const { settings, openAgentStep } = props;
  const [drawer, setDrawer] = useState<MapSide>();
  const opener = useRef<HTMLButtonElement | null>(null);
  const sides = mapSides(props);
  // Shown only while its side still has too many cards; a change to the file can take that away.
  const open =
    drawer !== undefined && sides[drawer].items.length > MAX_SIDE_CARDS ? drawer : undefined;
  const close = () => {
    setDrawer(undefined);
    opener.current?.focus();
  };
  const side = (key: MapSide) => (
    <Side
      side={key}
      columns={key === "use"}
      summary={
        sides[key].items.length > MAX_SIDE_CARDS && (
          <SummaryCard
            counts={sides[key].counts}
            heading={sides[key].heading}
            open={open === key}
            onOpen={(card) => {
              opener.current = card;
              setDrawer(key);
            }}
          />
        )
      }
      content={sides[key]}
    />
  );
  return (
    <MapFrame
      label={words.map(settings.name)}
      onCanvasPress={open === undefined ? undefined : close}
      drawer={
        open !== undefined && (
          // Keyed by its side, so another summary card's drawer takes the focus to its own title.
          <SummaryDrawer
            key={open}
            title={sides[open].heading}
            closeStack={props.closeStack}
            onClose={close}
          >
            {sides[open].items}
            {sides[open].add}
          </SummaryDrawer>
        )
      }
    >
      <div className="col-start-1 row-start-1">
        {(sides.in.items.length > 0 || sides.in.add) && side("in")}
      </div>
      <CentreCard settings={settings} openAgentStep={openAgentStep} />
      <div className="col-span-3 row-start-2">{side("use")}</div>
      <div className="col-start-3 row-start-1">{side("out")}</div>
    </MapFrame>
  );
}

/** What one side of the map holds: its heading, its cards and their counts, and its add button. */
interface SideContent {
  readonly heading: string;
  readonly counts: string;
  readonly items: readonly ReactNode[];
  /** Absent for Add trigger until a feature adds Triggers. */
  readonly add: ReactNode;
}

/** Each side's heading, cards, counts and add button, from what the map shows. */
function mapSides(props: AgentMapProps): Record<MapSide, SideContent> {
  const { settings, team, users, openSubagent, openAgent, openWorkflow } = props;
  const handsWork = team.filter(
    (member) => member.id !== settings.id && member.subagents.includes(settings.id),
  );
  const subagents = settings.subagents.flatMap((id) => team.filter((member) => member.id === id));
  return {
    in: {
      heading: words.workIn,
      counts: words.summary.in(users.length, handsWork.length),
      items: [
        ...users.map((user) => (
          <Card
            key={`${user.hubId}/${user.id}`}
            label={words.workflowCard(user.name, settings.name, user.steps)}
            onOpen={openWorkflow && (() => openWorkflow(user))}
          >
            <Kind>{words.workflow}</Kind>
            <span>{user.name}</span>
            <span className="text-caption text-fg-muted">{words.steps(user.steps)}</span>
          </Card>
        )),
        ...handsWork.map((member) => (
          <AgentCard key={member.id} agent={member} onOpen={openAgent} />
        )),
      ],
      add: props.addTrigger && <AddButton label={words.addTrigger} onAdd={props.addTrigger} />,
    },
    use: {
      heading: words.canUse,
      counts: words.summary.use(
        settings.skills.length,
        settings.knowledge.length,
        settings.connectors.length,
      ),
      items: toolCards(props),
      add: <AddButton label={words.addTool} onAdd={props.addTool} />,
    },
    out: {
      heading: words.workOut,
      counts: words.summary.out(subagents.length),
      items: subagents.map((member) => (
        <AgentCard key={member.id} agent={member} onOpen={openSubagent} />
      )),
      add: <AddButton label={words.addSubagent} onAdd={props.addSubagent} />,
    },
  };
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
function toolCards({ settings, tools, openTool }: AgentMapProps): readonly ReactNode[] {
  return agentToolLists.flatMap((list) =>
    settings[list].map((id) => (
      <Card key={`${list}/${id}`} onOpen={openTool && (() => openTool(list))}>
        <Kind>{words.kinds[list]}</Kind>
        <span>{tools[list].find((option) => option.id === id)?.name ?? id}</span>
      </Card>
    )),
  );
}

/**
 * One side of the map: a group named by its heading, its cards in a list, or its summary card when
 * it has more than {@link MAX_SIDE_CARDS}, then its add button.
 */
function Side({
  side,
  columns = false,
  summary,
  content,
}: {
  /** Which side it is, for the lines to its cards. */
  readonly side: MapSide;
  /** Three a row, for what it can use; one under the other otherwise. */
  readonly columns?: boolean;
  /** The summary card that stands for its cards, when it has too many. */
  readonly summary: ReactNode;
  readonly content: SideContent;
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
        {content.heading}
      </h2>
      <div className={columns ? "grid grid-cols-3 gap-2" : "flex flex-col gap-2"}>
        {summary || content.items}
        {content.add}
      </div>
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
