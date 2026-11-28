import { EmptyState, PlaceIcon } from "@halonicjs/studio-kit";
import { listColumnClass } from "@halonicjs/studio-kit/list-column";
import type { ItemRef } from "@halonicjs/studio-shell";
import { type ReactNode, type Ref, useEffect, useRef } from "react";
import type { Version } from "../api.ts";
import type { ChangeItem } from "../change-items.ts";
import type { ChangesList, ChangesListState } from "../changes-list.ts";
import { pageWords, stateWords, versionWords } from "../changes-words.ts";
import { VersionDetails } from "./history.tsx";
import { MergeChoices } from "./merge-choices.tsx";
import { WhatChangedPage } from "./whats-changed-page.tsx";

/**
 * The list column: the kit's one list-column size (`kit.list-column`), scrolling on its own so the
 * content pane stays put (`source-control.list-column`). Its parts keep their height (`*:shrink-0`):
 * the column has a fixed height, so a part with only a minimum height, as the Get updates strip,
 * would shrink to it and its text would run over the next part.
 */
export const changesListColumnClass = `${listColumnClass} flex shrink-0 flex-col gap-4 overflow-y-auto border-e border-border px-4 py-5 *:shrink-0`;

/**
 * The content pane: the rest of the width, scrolling on its own. It has no padding, so the empty
 * pane's wash runs edge to edge, as the Library's does; an item, a version and the choices draw
 * theirs ({@link paneContentClass}).
 */
export const changesContentPaneClass = "flex min-w-0 flex-1 flex-col overflow-y-auto";

/** The padding round what the pane shows when something is open in it. */
const paneContentClass = "flex flex-col px-6 py-5";

/** The props of {@link ChangesColumns}. */
export interface ChangesColumnsProps {
  /** What the content pane shows: from {@link ChangesPane}. */
  readonly pane: ReactNode;
  /** The list column: the Changes list, its sharing and its History. */
  readonly children: ReactNode;
  /** The list column's element, where a new version's row takes focus. */
  readonly listRef?: Ref<HTMLDivElement> | undefined;
}

/**
 * The desktop Changes in the new design (`source-control.list-column`): the list column with the
 * changed items and History, and beside it the content pane, with the open item's What changed.
 */
export function ChangesColumns({ pane, children, listRef }: ChangesColumnsProps) {
  return (
    <div className="flex h-full min-h-0 w-full">
      <div ref={listRef} className={changesListColumnClass} data-pane="list">
        {children}
      </div>
      <div className={changesContentPaneClass} data-pane="content">
        {pane}
      </div>
    </div>
  );
}

/** The props of {@link ChangesPane}. */
export interface ChangesPaneProps {
  readonly list: ChangesList;
  readonly state: ChangesListState;
  readonly items: readonly ChangeItem[];
  /** The item whose What changed is open; `undefined` shows the version, or what the list holds. */
  readonly open: ChangeItem | undefined;
  /** The version picked in History, shown when no item is open. */
  readonly version: Version | undefined;
  /** Escape in the version's details: focus goes back to the version's row. */
  readonly onVersionEscape: (id: string) => void;
  readonly developer: boolean;
  readonly openItem: ((item: ItemRef) => void) | undefined;
}

/**
 * What the content pane shows: Get updates' choices while the person picks them, else the open
 * item's What changed, else the picked version, else the Changes place's icon with how many items
 * changed. A new item or version is drawn anew, so focus moves to its heading each time.
 */
export function ChangesPane({
  list,
  state,
  items,
  open,
  version,
  onVersionEscape,
  developer,
  openItem,
}: ChangesPaneProps) {
  if (state.merge !== undefined && state.choosing) {
    return (
      <div className={paneContentClass}>
        <MergeChoices list={list} phone={false} />
      </div>
    );
  }
  if (open !== undefined) {
    return (
      <div key={open.id} className={paneContentClass}>
        <WhatChangedPage list={list} item={open} developer={developer} openItem={openItem} inPane />
      </div>
    );
  }
  if (version !== undefined) {
    return (
      <div key={version.id} className={paneContentClass}>
        <PaneVersion version={version} list={list} onEscape={() => onVersionEscape(version.id)} />
      </div>
    );
  }
  // A grid item stretches, so the empty state's wash fills the pane.
  return (
    <div className="grid flex-1">
      <EmptyState
        align="center"
        headingLevel={2}
        icon={<PlaceIcon name="changes" />}
        title={pageWords.title}
        description={paneSentence(state, items)}
      />
    </div>
  );
}

/**
 * Under "Changes" in the empty pane: "3 items", as the list counts them, or that nothing changed.
 * Nothing under a first read's skeleton: the columns show only for a read that worked or one still
 * on its way.
 */
function paneSentence(state: ChangesListState, items: readonly ChangeItem[]): string | undefined {
  if (state.read?.kind !== "ready") return undefined;
  return items.length === 0 ? stateWords.nothingChanged : versionWords.itemCount(items.length);
}

/** A picked version in the pane: its title takes focus when it is drawn. */
function PaneVersion({
  version,
  list,
  onEscape,
}: {
  readonly version: Version;
  readonly list: ChangesList;
  readonly onEscape: () => void;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => title.current?.focus(), []);
  return (
    <VersionDetails version={version} list={list} titleRef={title} onEscape={onEscape} inPane />
  );
}
