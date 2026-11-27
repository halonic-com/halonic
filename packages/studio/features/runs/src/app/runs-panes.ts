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
  /** Notes that the person opened the row, so its failure leaves Failed (`runs.run-groups`). */
  readonly markOpened: (id: string) => void;
  /** Shows the run in the content pane. */
  readonly show: (item: RunItem) => void;
  /**
   * Opens the run's page in a new tab, or as the page on a phone, which has no tabs; absent in a
   * context built without a window.
   */
  readonly openInNewTab?: (item: RunItem) => void;
}

/** What the list does with a row's id: a click or Enter, and a Ctrl, Cmd or middle click. */
export interface RowActions {
  readonly onOpen: (id: string) => void;
  readonly onOpenInNewTab?: (id: string) => void;
}

/**
 * A click or Enter marks the row opened and shows its run in the pane; a Ctrl-click, Cmd-click
 * or middle click opens it in a new tab instead, and marks it opened too. A row with no page, an
 * agent's run, opens nothing, but a click still marks it opened, as the person looked at it.
 */
export function rowActions(rows: readonly AllRunsRow[], ways: RowWays): RowActions {
  const itemOf = (id: string) => rows.find((row) => row.id === id)?.item;
  const { openInNewTab } = ways;
  return {
    onOpen: (id) => {
      ways.markOpened(id);
      const item = itemOf(id);
      if (item !== undefined) ways.show(item);
    },
    ...(openInNewTab === undefined
      ? {}
      : {
          onOpenInNewTab: (id: string) => {
            const item = itemOf(id);
            if (item === undefined) return;
            ways.markOpened(id);
            openInNewTab(item);
          },
        }),
  };
}

/** How the content pane's run page reaches the Runs page around it. */
export interface PaneWays {
  /** Shows another run in the pane. */
  readonly show: (item: RunItem) => void;
  /** Closes the run, leaving the pane empty, or the list alone in one pane. */
  readonly close: () => void;
}

/**
 * The context the content pane's run page gets. A run it opens on its own, such as one started
 * again or a child run, shows in the pane, so the Runs page stays in its tab; a run asked for at
 * a step, and every other item, opens as the shell opens it. Its way to Runs, such as **Go to
 * Runs** on a run that left the workspace, closes the run, as Runs is already showing.
 */
export function paneContext(context: PageContext, ways: PaneWays): PageContext {
  const { openItem, openPlace } = context;
  return {
    ...context,
    ...(openItem === undefined
      ? {}
      : {
          openItem: (item, options) => {
            if (item.kind === "run" && options === undefined) {
              ways.show({ kind: "run", hub: item.hub, id: item.id });
              return;
            }
            openItem(item, options);
          },
        }),
    ...(openPlace === undefined
      ? {}
      : {
          openPlace: (place) => {
            if (place === "runs") return ways.close();
            openPlace(place);
          },
        }),
  };
}
