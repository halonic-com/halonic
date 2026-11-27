import type {
  InboxItem as AgentItem,
  AgentMessaging,
  MessagingProject,
  MessagingSource,
} from "@halonicjs/ports";
import type {
  ActionItem,
  RequesterPolicy,
  StepperCatalog,
} from "@halonicjs/studio-feature-action-steppers/api";
import { Button, type ListRow, StatusChip, waitingFor } from "@halonicjs/studio-kit";
import type { ActionSteps } from "@halonicjs/studio-services";
import {
  type ReactNode,
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  type AgentBundle,
  bundleAgentItems,
  bundleAsker,
  bundleTitle,
  rowKeyHolding,
} from "../agent/agent-bundles.ts";
import { AgentInbox, type AgentInboxState } from "../agent/agent-inbox.ts";
import {
  agentItemAsker,
  agentItemKey,
  agentItemTitle,
  isAgentItemLate,
  sourceDownLine,
} from "../agent/agent-item-text.ts";
import { agentItemShows, type ProjectFilter } from "../agent/project-filter.ts";
import { ActionItemCard } from "./action-item-card.tsx";
import { AgentItemCard, type AgentItemCardProps } from "./agent-item-card.tsx";
import { lineEndingInWait, wholeLine } from "./inbox-row.tsx";
import type { ItemHeading } from "./item-header.tsx";
import { ProjectTag } from "./project-tag.tsx";
import { agentMark } from "./row-marks.tsx";
import { type SettlingRowsOptions, settledRow, useSettlingRows } from "./settling-rows.tsx";
import { type AskerPicture, useAskerPictures } from "./use-asker-pictures.ts";

/** What the Inbox page shows of the agents' items, next to its own. */
export interface AgentItems {
  /** How many items wait, for the Needs you count. */
  readonly waiting: number;
  /**
   * Each row that waits, in list order, with how many items it holds, so the open item's place
   * ("2 of 6") counts as the heading does (`inbox.one-count`).
   */
  readonly order: readonly AgentRowOrder[];
  /** The items that wait, for the project filter's chips. */
  readonly waitingItems: readonly AgentItem[];
  /**
   * One row per open item or bundle of them that the project filter shows, after the Inbox's own
   * rows (`inbox.agent-item-bundles`). A bundle holds one project's items, so it shows whole or not.
   */
  readonly rows: (now: Date, filter: ProjectFilter) => ListRow[];
  /** Over the list: each source that can't take answers, and a read that failed. */
  readonly lines: (now: Date) => ReactNode;
  /** The open row's key, while one is open. */
  readonly openKey: string | undefined;
  /** The keys of the open row's cards, for their read marks (`inbox.read-marks`); none while closed. */
  readonly openItemKeys: readonly string[];
  /**
   * The header over the open row's cards: its row's title and line, with the first card's asker at
   * 40px (`inbox.header-avatar`); `undefined` while none is open.
   */
  readonly heading: (now: Date) => ItemHeading | undefined;
  /** Opens the item or bundle of that row key; `false` when the key isn't an agent row's. */
  readonly open: (key: string) => boolean;
  readonly close: () => void;
  /** The open row's cards, or `otherwise` while none is open. */
  readonly card: (now: () => Date, otherwise: ReactNode) => ReactNode;
  /** Holds the rows that ended, then sends them away (`inbox.final-state`); rendered once on the page. */
  readonly settlers: ReactNode;
}

/** A row that waits: its key, how many items it holds and their keys, oldest first. */
export interface AgentRowOrder {
  readonly key: string;
  readonly items: number;
  readonly keys: readonly string[];
}

const nothing: AgentInboxState = {
  loaded: true,
  sources: [],
  agents: [],
  items: [],
  work: [],
  error: undefined,
};

/** Couldn't read the agents' items; said over the list, with **Try again**. */
export const agentLoadFailed = "Couldn't load the items from your agents.";

/**
 * What an action item is checked against when it opens, the installed catalog and the user's
 * policy, and what runs its steps.
 */
export interface ActionChecks {
  readonly catalog: StepperCatalog;
  readonly policy: RequesterPolicy;
  readonly steps: ActionSteps;
}

function isActionItem(item: AgentItem): item is ActionItem {
  return item.action !== undefined;
}

/** An agent's card, or for an action item the stepper in review mode (`inbox.agent-action-items`). */
function AgentCard({ checks, ...card }: AgentItemCardProps & { readonly checks: ActionChecks }) {
  const { item } = card;
  if (!isActionItem(item)) return <AgentItemCard {...card} />;
  return (
    <ActionItemCard
      {...card}
      item={item}
      catalog={checks.catalog}
      policy={checks.policy}
      steps={checks.steps}
    />
  );
}

/**
 * The agents' cards and questions for the Inbox page (`inbox.agent-inbox-items`), read from
 * `AgentMessaging` while the page is open. Without it, there are none. Action items open the
 * stepper, checked against `checks`.
 */
export function useAgentItems(
  messaging: AgentMessaging | undefined,
  checks: ActionChecks,
  settle: Omit<SettlingRowsOptions, "saidHere">,
): AgentItems {
  const inbox = useMemo(
    () => (messaging === undefined ? undefined : new AgentInbox(messaging)),
    [messaging],
  );
  const subscribe = useCallback(
    (listener: () => void) => inbox?.subscribe(listener) ?? (() => {}),
    [inbox],
  );
  const state = useSyncExternalStore(subscribe, () => inbox?.state ?? nothing);
  const pictureOf = useAskerPictures(inbox, state);
  const [opened, setOpened] = useState<Opened | undefined>(undefined);
  const waiting = state.items.filter((item) => item.state.kind === "open");
  const bundles = bundleAgentItems(waiting);
  // The items whose card here said how they ended already, so they aren't read out again.
  const saidHere = useRef(new Set<string>());
  const ended = useSettlingRows(bundles, state.items, {
    ...settle,
    saidHere: saidHere.current,
  });
  const endedKeys = new Set(ended.bundles.map((bundle) => bundle.key));
  const sourceOf = (item: AgentItem) => state.sources.find((source) => source.id === item.source);
  const workOf = (item: AgentItem) => state.work.find((work) => work.id === item.work);
  // From every item, answered too, so an answered card stays open and says who answered it.
  const openItems = (opened?.ids ?? []).flatMap((id) => {
    const found = state.items.find((item) => item.id === id);
    return found === undefined ? [] : [found];
  });
  // Stable, so the page can close the card from an effect when its own item opens.
  const close = useCallback(() => setOpened(undefined), []);

  return {
    waiting: waiting.length,
    order: bundles.map((bundle) => ({
      key: bundle.key,
      items: bundle.items.length,
      keys: bundle.items.map(agentItemKey),
    })),
    waitingItems: waiting,
    rows: (now, filter) =>
      ended
        .inPlace(bundles)
        .filter((bundle) => bundle.items.some((item) => agentItemShows(item, filter)))
        .map((bundle) => {
          const row = bundleRow(bundle, state, now, pictureOf);
          return endedKeys.has(bundle.key) ? settledRow(row, bundle) : row;
        }),
    lines: (now) => (
      <SourceLines
        sources={state.sources}
        failed={state.error !== undefined}
        retry={() => void inbox?.refresh()}
        now={now}
      />
    ),
    openKey:
      openItems.length === 0 || opened === undefined
        ? undefined
        : (rowKeyHolding(opened, bundles) ?? opened.key),
    openItemKeys: openItems.map(agentItemKey),
    heading: (now) => {
      const [first] = openItems;
      if (first === undefined || opened === undefined) return undefined;
      // The row that holds any open card that still waits, as `openKey` finds it: answering a
      // bundle's first card leaves the header on what still waits.
      const key = rowKeyHolding(opened, bundles);
      const bundle = bundles.find((each) => each.key === key);
      if (bundle === undefined) {
        // Once none waits, the first card heads itself, and its line ends at who asks (HAL-19913).
        const line = withProject(
          first.project,
          { meta: agentItemAsker(first, sourceOf(first)) },
          false,
        );
        const picture = agentMark(first, "header", pictureOf(first)).avatar;
        return { picture, title: agentItemTitle(first), line: line.meta };
      }
      // The header names the project whole (sketch E on HAL-19192).
      const row = bundleRow(bundle, state, now, pictureOf, false);
      const [oldest] = bundle.items;
      return {
        picture: agentMark(oldest, "header", pictureOf(oldest)).avatar,
        title: row.title,
        line: wholeLine(row),
      };
    },
    open: (key) => {
      const found = bundles.find((bundle) => bundle.key === key);
      setOpened(found === undefined ? undefined : { key, ids: found.items.map((item) => item.id) });
      return found !== undefined;
    },
    close,
    card: (now, otherwise) =>
      openItems.length === 0 || inbox === undefined ? (
        otherwise
      ) : (
        <div key={opened?.key} className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          {openItems.map((item, index) => (
            <AgentCard
              key={item.id}
              checks={checks}
              item={item}
              source={sourceOf(item)}
              work={workOf(item)}
              agents={state.agents}
              now={now}
              answer={(answer) => {
                saidHere.current.add(item.id);
                return inbox.answer(item.id, answer);
              }}
              onEndedRead={() => saidHere.current.add(item.id)}
              readAttachment={(attachment) => inbox.readAttachment(attachment)}
              focusOnOpen={index === 0}
            />
          ))}
        </div>
      ),
    settlers: ended.settlers,
  };
}

/** The row that is open: its key, and the items it held when opened, oldest first. */
interface Opened {
  readonly key: string;
  readonly ids: readonly string[];
}

/**
 * A row of the agents' items: one item's title, or a bundle's count, then its project, the
 * source, who asks and how long the oldest has waited (`inbox.agent-item-bundles`,
 * `inbox.project-dot`). A bundle holds one project's items. `cut` cuts a long project name, as a
 * row does; the header shows it whole.
 */
function bundleRow(
  bundle: AgentBundle,
  state: AgentInboxState,
  now: Date,
  pictureOf: AskerPicture,
  cut = true,
): ListRow {
  const [oldest] = bundle.items;
  if (oldest === undefined) return { id: bundle.key, title: "" };
  const source = state.sources.find((each) => each.id === oldest.source);
  if (bundle.items.length === 1) return agentRow(oldest, source, now, pictureOf(oldest), cut);
  const work = state.work.find((each) => each.id === bundle.work);
  const row = {
    ...agentMark(oldest, "sidebar", pictureOf(oldest)),
    id: bundle.key,
    title: bundleTitle(bundle, work),
    ...withProject(
      oldest.project,
      lineEndingInWait(bundleAsker(bundle, source), waitingFor(new Date(oldest.createdAt), now)),
      cut,
    ),
    wrapTitle: true,
    wrapMeta: true,
  };
  return isAgentItemLate(oldest, now)
    ? { ...row, trailing: <StatusChip tone="attention">Late</StatusChip> }
    : row;
}

/** An agent item's row: its title, then its project, source, who asks and how long it has waited. */
function agentRow(
  item: AgentItem,
  source: MessagingSource | undefined,
  now: Date,
  picture: ImageBitmap | undefined,
  cut: boolean,
): ListRow {
  const row = {
    ...agentMark(item, "sidebar", picture),
    id: agentItemKey(item),
    title: agentItemTitle(item),
    ...withProject(
      item.project,
      lineEndingInWait(agentItemAsker(item, source), waitingFor(new Date(item.createdAt), now)),
      cut,
    ),
    wrapTitle: true,
    wrapMeta: true,
  };
  return isAgentItemLate(item, now)
    ? { ...row, trailing: <StatusChip tone="attention">Late</StatusChip> }
    : row;
}

/** A row's line, led by its item's project when it has one (`inbox.project-dot`). */
function withProject(
  project: MessagingProject | undefined,
  line: Pick<ListRow, "meta" | "metaEnd">,
  cut: boolean,
): Pick<ListRow, "meta" | "metaEnd"> {
  if (project === undefined) return line;
  return {
    ...line,
    meta: (
      <>
        <ProjectTag project={project} cut={cut} />
        {line.meta === "" || line.meta === undefined ? null : <> · {line.meta}</>}
      </>
    ),
  };
}

function SourceLines({
  sources,
  failed,
  retry,
  now,
}: {
  readonly sources: readonly MessagingSource[];
  readonly failed: boolean;
  readonly retry: () => void;
  readonly now: Date;
}) {
  const down = sources.flatMap((source) => {
    const line = sourceDownLine(source, now);
    return line === null ? [] : [{ id: source.id, text: `${source.label} · ${line}` }];
  });
  if (down.length === 0 && !failed) return null;
  return (
    <div className="flex flex-col gap-1 px-4 pb-2 text-small text-fg-muted">
      {down.map((line) => (
        <p key={line.id}>{line.text}</p>
      ))}
      {failed ? (
        <p className="flex flex-wrap items-center gap-2">
          {agentLoadFailed}
          <Button variant="ghost" size="sm" onClick={retry}>
            Try again
          </Button>
        </p>
      ) : null}
    </div>
  );
}
