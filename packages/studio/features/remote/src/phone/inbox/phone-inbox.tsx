import type { InboxItem } from "@halonicjs/ports";
import { markHiddenName } from "@halonicjs/std";
import {
  EmptyState,
  FilterChips,
  HandIcon,
  HelpIcon,
  ListHeading,
  LockIcon,
  StatusChip,
  waitingFor,
} from "@halonicjs/studio-kit";
import { useId, useState } from "react";
import type { MessagingClient } from "../messaging-client.ts";
import type { RemoteView } from "../remote-view.ts";
import { answersOnPhone, InboxCard } from "./inbox-card.tsx";
import { inboxWords } from "./inbox-words.ts";
import { askerLine, isApproval, itemTitle } from "./item-text.ts";
import { type PhoneInboxNames, usePhoneInbox } from "./use-phone-inbox.ts";

/** The built risky row hint: the card's line without its full stop (wording p02a). */
const riskyRowHint = "Answer this on your computer";

/** The project chips' value: every item, the items of no project, or one project's, by its ID. */
type ProjectFilter = "all" | "none" | `project:${string}`;

/**
 * `p02a`, `p03d`: the Inbox tab of one computer, its open cards oldest first under "Needs you",
 * with a chip per project over them. Tapping a card opens it in place of the list; Back or Next
 * comes back to the list.
 */
export function PhoneInbox({
  view,
  messaging,
  computer,
  onOpenSettings,
}: {
  readonly view: RemoteView;
  readonly messaging: MessagingClient;
  readonly computer: string;
  readonly onOpenSettings: () => void;
}) {
  const { items, names } = usePhoneInbox(messaging, view.canAnswer);
  const [filter, setFilter] = useState<ProjectFilter>("all");
  // The card the person opened, kept as it was so it still shows after its answer leaves the list.
  const [opened, setOpened] = useState<InboxItem | undefined>(undefined);
  if (opened !== undefined) {
    return (
      <InboxCard
        item={opened}
        view={view}
        messaging={messaging}
        computer={computer}
        names={names}
        onBack={() => setOpened(undefined)}
        onOpenSettings={onOpenSettings}
      />
    );
  }
  if (items === undefined) {
    return (
      <p role="status" className="text-small text-fg-muted">
        {inboxWords.loading}
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col justify-center">
        <EmptyState title={inboxWords.emptyTitle} description={inboxWords.emptyText} />
      </div>
    );
  }
  const chips = projectChips(items);
  const shown = chips.some((chip) => chip.value === filter) ? filter : "all";
  return (
    <div className="flex flex-col gap-2">
      {chips.length === 0 ? null : (
        <FilterChips
          label={inboxWords.projects}
          flush
          options={chips}
          value={shown}
          onChange={setFilter}
        />
      )}
      <InboxList
        items={items.filter((item) => itemShows(item, shown))}
        names={names}
        view={view}
        onOpen={setOpened}
      />
    </div>
  );
}

/**
 * The project chips (p02a): All, each project of an item that waits, by name, then No project when
 * an item waits with none. With no project at all there is nothing to filter, so no chips.
 */
function projectChips(items: readonly InboxItem[]) {
  const projects = new Map<string, string>();
  for (const item of items) {
    if (item.project !== undefined) projects.set(item.project.id, item.project.name);
  }
  if (projects.size === 0) return [];
  const named = [...projects]
    .sort(([, a], [, b]) => a.localeCompare(b))
    .map(([id, name]) => ({ value: `project:${id}` as const, label: markHiddenName(name) }));
  const unfiled = items.some((item) => item.project === undefined);
  return [
    { value: "all" as const, label: inboxWords.allProjects },
    ...named,
    ...(unfiled ? [{ value: "none" as const, label: inboxWords.noProject }] : []),
  ];
}

function itemShows(item: InboxItem, filter: ProjectFilter): boolean {
  if (filter === "all") return true;
  if (filter === "none") return item.project === undefined;
  return item.project !== undefined && filter === `project:${item.project.id}`;
}

/** `p02a`: the open cards under "Needs you", "n waiting" on the right, each a row that opens it. */
function InboxList({
  items,
  names,
  view,
  onOpen,
}: {
  readonly items: readonly InboxItem[];
  readonly names: PhoneInboxNames;
  readonly view: RemoteView;
  readonly onOpen: (item: InboxItem) => void;
}) {
  const titleId = useId();
  const countId = useId();
  const now = new Date();
  return (
    <section aria-labelledby={`${titleId} ${countId}`} className="-mx-4 flex flex-col">
      <div className="flex items-baseline justify-between pr-4">
        <ListHeading name={inboxWords.needsYou} id={titleId} />
        <span id={countId} className="text-caption text-fg-muted">
          {inboxWords.waiting(items.length)}
        </span>
      </div>
      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={item.id} className="border-b border-border">
            <InboxRow
              item={item}
              source={names.sources.get(item.source)}
              waiting={waitingFor(new Date(item.createdAt), now)}
              risky={!answersOnPhone(item, view)}
              onOpen={() => onOpen(item)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * One row (p02a): the kind's icon, the title with "Waiting 6 h" on its right, the asker line, the
 * source in muted words, and the risky hint with its lock.
 */
function InboxRow({
  item,
  source,
  waiting,
  risky,
  onOpen,
}: {
  readonly item: InboxItem;
  readonly source: string | undefined;
  readonly waiting: string;
  readonly risky: boolean;
  readonly onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full gap-3 px-4 py-3 text-left focus-ring hover:bg-surface-muted"
      onClick={onOpen}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 inline-grid size-icon-sm shrink-0 place-items-center text-warning *:size-full"
      >
        {isApproval(item) ? <HandIcon /> : <HelpIcon />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0 wrap-break-word text-body-strong text-fg">
            {itemTitle(item)}
          </span>
          <StatusChip tone="warning">{waiting}</StatusChip>
        </span>
        <span className="text-small text-fg-muted">{askerLine(item)}</span>
        {source === undefined ? null : <span className="text-caption text-fg-muted">{source}</span>}
        {risky ? (
          <span className="flex items-center gap-1 text-caption text-fg-muted">
            <span aria-hidden="true" className="inline-grid size-3 *:size-full">
              <LockIcon />
            </span>
            {riskyRowHint}
          </span>
        ) : null}
      </span>
    </button>
  );
}
