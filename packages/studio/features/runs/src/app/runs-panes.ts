// The Runs page's two panes (`runs.list-column`): the list column and the run
// open beside it, and what a row's click, Enter and new-tab gesture do. Kept out
// of the view so the rules are tested without drawing the page.

import type { PlaceViewProps } from "@halonicjs/studio-shell";
import type { AllRunsRow } from "./source-rows.ts";

/** The workspace's context, as the shell gives it to a page. */
type PageContext = PlaceViewProps["context"];

/** The page a run row opens: a workflow run's. An agent's run has none yet. */
export type RunItem = NonNullable<AllRunsRow["item"]>;

/** Which of the Runs page's panes show. */
export interface RunsPanes {
  readonly list: boolean;
  readonly run: boolean;
}

/**
 * Both panes in a wide window. In one pane (a phone, or a window narrower than 900px) the list
 * shows until a run is open, then the run alone.
 */
export function runsPanes(onePane: boolean, open: RunItem | undefined): RunsPanes {
  if (!onePane) return { list: true, run: true };
  return open === undefined ? { list: true, run: false } : { list: false, run: true };
}

/** The ways a row's gestures reach the page. */
export interface RowWays {
  /** Shows the run in the content pane. */
  readonly show: (item: RunItem) => void;
  /** Opens the run's page in a new tab; absent where the window has no tabs. */
  readonly openInNewTab?: (item: RunItem) => void;
}

/** What the list does with a row's id: a click or Enter, and a Ctrl, Cmd or middle click. */
export interface RowActions {
  readonly onOpen: (id: string) => void;
  readonly onOpenInNewTab?: (id: string) => void;
}

/**
 * A click or Enter shows the row's run in the pane; a Ctrl-click, Cmd-click or middle click
 * opens it in a new tab instead. A row with no page, an agent's run, does neither.
 */
export function rowActions(rows: readonly AllRunsRow[], ways: RowWays): RowActions {
  const itemOf = (id: string) => rows.find((row) => row.id === id)?.item;
  const { openInNewTab } = ways;
  return {
    onOpen: (id) => {
      const item = itemOf(id);
      if (item !== undefined) ways.show(item);
    },
    ...(openInNewTab === undefined
      ? {}
      : {
          onOpenInNewTab: (id: string) => {
            const item = itemOf(id);
            if (item !== undefined) openInNewTab(item);
          },
        }),
  };
}

/**
 * The context the content pane's run page gets: a run it opens on its own, such as one started
 * again or a child run, shows in the pane, so the Runs page stays in its tab. A run asked for at
 * a step, and every other item, opens as the shell opens it.
 */
export function paneContext(context: PageContext, show: (item: RunItem) => void): PageContext {
  const { openItem } = context;
  if (openItem === undefined) return context;
  return {
    ...context,
    openItem: (item, options) => {
      if (item.kind === "run" && options === undefined) {
        show({ kind: "run", hub: item.hub, id: item.id });
        return;
      }
      openItem(item, options);
    },
  };
}
