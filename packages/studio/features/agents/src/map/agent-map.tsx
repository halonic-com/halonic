import {
  HandIcon,
  LetterTile,
  ListHeading,
  type PlaceIconName,
  StatusChip,
} from "@halonicjs/studio-kit";
import type { CloseStack } from "@halonicjs/studio-shell";
import { type ReactNode, useContext, useId, useLayoutEffect, useRef, useState } from "react";
import {
  type AgentListing,
  type AgentRoutine,
  type AgentSettings,
  type AgentStep,
  type AgentTeamMember,
  type AgentToolList,
  type AgentToolOption,
  type AgentUser,
  agentToolLists,
} from "../api.ts";
import { MapFrame, MapStacked } from "./map-frame.tsx";
import type { MapSide } from "./map-geometry.ts";
import { StackedAddRow, StackedRow, stackedRowsClasses } from "./map-rows.tsx";
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
  /** The routines that start it by itself. */
  readonly routines: readonly AgentRoutine[];
  readonly openAgentStep: (step: AgentStep) => void;
  readonly openSubagent: (agent: AgentListing) => void;
  /** Opens another agent's page, for one that hands it work; absent leaves its card as text. */
  readonly openAgent?: ((agent: AgentListing) => void) | undefined;
  /** Opens a routine's page; absent leaves its card as text, as does a routine at the root. */
  readonly openRoutine?: ((routine: AgentRoutine) => void) | undefined;
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

// On a phone every card and add button is a 48 px target (HAL-485 11.6, Noah's N8).
const cardClasses =
  "flex w-full flex-col items-start gap-0.5 rounded-md border border-border bg-surface-raised px-3 py-2 text-start text-small text-fg phone:min-h-touch phone:px-2";
const pressableClasses = `${cardClasses} hover:bg-surface-subtle focus-ring`;
const addClasses =
  "w-full rounded-md border border-dashed border-border-strong px-3 py-2 text-start text-small text-fg-muted hover:bg-surface-subtle focus-ring phone:min-h-touch phone:px-2";

/**
 * The agent map (`agents.map.layout-by-side`, flow-agents 6): the agent in the centre with its
 * agent steps; on the left what brings it work (the routines that start it, the workflows that
 * run it and the agents that hand it work), below what it can use (skills, knowledge, connectors, three a row), and on the
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
  const boxes = useRef<Partial<Record<MapSide, HTMLDivElement | null>>>({});
  const sides = mapSides(props);
  // Shown only while its side still has too many cards; a change to the file can take that away.
  const open =
    drawer !== undefined && sides[drawer].items.length > MAX_SIDE_CARDS ? drawer : undefined;
  // When it does, the drawer and its summary card go, and the focus in them with them: it goes to
  // the side's first card or button instead of the page's body.
  useLayoutEffect(() => {
    if (drawer === undefined || open !== undefined) return;
    setDrawer(undefined);
    if (document.activeElement === null || document.activeElement === document.body) {
      boxes.current[drawer]?.querySelector<HTMLElement>("button")?.focus();
    }
  }, [drawer, open]);
  const box = (key: MapSide) => (element: HTMLDivElement | null) => {
    boxes.current[key] = element;
  };
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
      {/* Only with something on it, so an empty left side leaves no gap in the stacked map. */}
      {(sides.in.items.length > 0 || sides.in.add) && (
        <div ref={box("in")} className="col-start-1 row-start-1">
          {side("in")}
        </div>
      )}
      <CentreCard settings={settings} openAgentStep={openAgentStep} />
      <div ref={box("use")} className="col-span-3 row-start-2">
        {side("use")}
      </div>
      <div ref={box("out")} className="col-start-3 row-start-1">
        {side("out")}
      </div>
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
  const { settings, team, users, routines, openSubagent, openAgent, openRoutine, openWorkflow } =
    props;
  const handsWork = team.filter(
    (member) => member.id !== settings.id && member.subagents.includes(settings.id),
  );
  const subagents = settings.subagents.flatMap((id) => team.filter((member) => member.id === id));
  return {
    in: {
      heading: words.workIn,
      counts: words.summary.in(routines.length, users.length, handsWork.length),
      items: [
        ...routines.map((routine) => (
          <Card
            key={`${routine.hubId ?? ""}/${routine.id}`}
            icon="routines"
            kind={words.routine}
            name={routine.name}
            detail={<StatusChip tone="danger">{words.cantStart}</StatusChip>}
            label={words.routineCard(routine.name)}
            // A routine at the workspace's root has no page of its own yet, so its card is text.
            onOpen={openRoutine && routine.hubId !== null ? () => openRoutine(routine) : undefined}
          />
        )),
        ...users.map((user) => (
          <Card
            key={`${user.hubId}/${user.id}`}
            icon="workflows"
            kind={words.workflow}
            name={user.name}
            detail={words.steps(user.stepNames ?? user.stepIds)}
            label={words.workflowCard(user.name, settings.name, user.stepNames ?? user.stepIds)}
            onOpen={openWorkflow && (() => openWorkflow(user))}
          />
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

const stepLinksClasses = "flex flex-col gap-1 phone:gap-0 phone:divide-y phone:divide-border";
const stepLinkClasses =
  "text-small text-fg underline-offset-2 hover:underline focus-ring phone:flex phone:min-h-touch phone:w-full phone:items-center phone:font-medium phone:text-accent-text";
// Stacked, the agent steps are the phone's 48 px rows at every size, since larger text stacks it.
const stepRowsClasses = "flex flex-col divide-y divide-border";
const stepRowClasses =
  "flex min-h-touch w-full items-center text-small font-medium text-accent-text focus-ring";

/**
 * The agent itself: its avatar and name, which open nothing, and its agent steps, each a card. On a
 * phone the steps are 48 px rows across the card, with a line between them (HAL-485 11.6).
 */
function CentreCard({
  settings,
  openAgentStep,
}: Pick<AgentMapProps, "settings" | "openAgentStep">) {
  const stepsId = useId();
  // Stacked, it's a card inset 16 px between the rows, its name a section title (15.8).
  const stacked = useContext(MapStacked);
  return (
    <div
      data-map-centre=""
      className={`col-start-2 row-start-1 flex flex-col gap-2 rounded-lg border border-border-strong bg-surface-raised ${stacked ? "mx-4 px-4 py-3" : "p-4 phone:p-2"}`}
    >
      <p
        className={`flex items-center gap-2 text-fg ${stacked ? "text-section" : "text-body-strong"}`}
      >
        <LetterTile name={settings.name} />
        {settings.name}
      </p>
      {settings.agentSteps.length > 0 && (
        // biome-ignore lint/a11y/useSemanticElements: a list of links, not form fields, so not a fieldset.
        <div role="group" aria-labelledby={stepsId} className="flex flex-col gap-1">
          <p id={stepsId} className="text-caption text-fg-muted">
            {words.agentSteps}
          </p>
          <ul className={stacked ? stepRowsClasses : stepLinksClasses}>
            {settings.agentSteps.map((step) => (
              <li key={step.id}>
                <button
                  type="button"
                  className={stacked ? stepRowClasses : stepLinkClasses}
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

/**
 * The skills, knowledge and connectors it uses, by name, in the Tools page's order. A connector
 * shows the hand with the words "Every tool asks first", or the read-only tools that don't
 * (flow-agents 6, Noah's N1), so it isn't a bare icon (`agents.map.asks-first`).
 */
function toolCards({ settings, tools, openTool }: AgentMapProps): readonly ReactNode[] {
  return agentToolLists.flatMap((list) =>
    settings[list].map((id) => {
      const option = tools[list].find((each) => each.id === id);
      const name = option?.name ?? id;
      const asksFirst =
        option?.toolsWithoutAsking === undefined
          ? undefined
          : words.asksFirst(option.toolsWithoutAsking);
      return (
        <Card
          key={`${list}/${id}`}
          icon="library"
          kind={words.kinds[list]}
          name={name}
          detail={
            asksFirst && (
              <span className="inline-flex items-center gap-1 font-medium text-warning">
                <span aria-hidden="true" className="inline-grid size-icon-sm shrink-0 *:size-full">
                  <HandIcon />
                </span>
                {asksFirst}
              </span>
            )
          }
          label={asksFirst && `${words.kinds[list]} ${name}, ${asksFirst}`}
          onOpen={openTool && (() => openTool(list))}
        />
      );
    }),
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
  /** Three a row for what it can use; one under the other otherwise, and always when stacked. */
  readonly columns?: boolean;
  /** The summary card that stands for its cards, when it has too many. */
  readonly summary: ReactNode;
  readonly content: SideContent;
}) {
  const headingId = useId();
  const stacked = useContext(MapStacked);
  if (stacked) {
    // A flush list under the kit's List heading (component specs 15.8, 18.3).
    return (
      // biome-ignore lint/a11y/useSemanticElements: a side of cards, not form fields, so not a fieldset.
      <div role="group" aria-labelledby={headingId} data-map-side={side}>
        <ListHeading id={headingId} name={content.heading} />
        <div className={stackedRowsClasses}>
          {summary || content.items}
          {content.add}
        </div>
      </div>
    );
  }
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

/**
 * A card of the map: a button that opens its item, or text where the app can't open it. In the
 * stacked map it's a row, its kind's icon before its name over its kind and detail (component
 * specs 15.8).
 */
function Card({
  icon,
  kind,
  name,
  detail,
  label,
  onOpen,
}: {
  /** Its kind's place icon, shown in the stacked map's row. */
  readonly icon: PlaceIconName;
  /** What kind of item it is, in small caps; read before its name. */
  readonly kind: string;
  readonly name: string;
  /** One more line under its name: a workflow's steps, a connector's tools that ask first. */
  readonly detail?: ReactNode;
  /** Its accessible name, when its text doesn't say enough. */
  readonly label?: string | undefined;
  readonly onOpen?: (() => void) | undefined;
}) {
  const stacked = useContext(MapStacked);
  if (stacked) {
    const more = detail ? <> · {detail}</> : null;
    return (
      <StackedRow
        icon={icon}
        name={name}
        detail={
          <>
            {kind}
            {more}
          </>
        }
        label={label}
        onOpen={onOpen}
      />
    );
  }
  const children = (
    <>
      <span className="text-caption text-fg-muted uppercase">{kind} </span>
      <span>{name}</span>
      {detail && <span className="text-caption text-fg-muted">{detail}</span>}
    </>
  );
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
    <Card
      icon="agents"
      kind={words.agent}
      name={agent.name}
      onOpen={onOpen && (() => onOpen(agent))}
    />
  );
}

/** The add button a side ends in, also when the side is empty; the last row in a stacked map. */
function AddButton({ label, onAdd }: { readonly label: string; readonly onAdd: () => void }) {
  const stacked = useContext(MapStacked);
  if (stacked) return <StackedAddRow label={label} onAdd={onAdd} />;
  return (
    <button type="button" className={addClasses} onClick={onAdd}>
      <span aria-hidden="true">+ </span>
      {label}
    </button>
  );
}
