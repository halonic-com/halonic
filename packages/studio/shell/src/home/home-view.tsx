import {
  BackIcon,
  Button,
  FramedPanel,
  SidebarFrame,
  useNarrow,
  usePresentation,
} from "@halonicjs/studio-kit";
import { type ReactNode, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type {
  HomeContentPaneProps,
  HomeListColumnProps,
  HomeViewContribution,
} from "../points/home.ts";
import type { Registered } from "../points/point-store.ts";
import { LoadedView } from "../view-loading.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";

/** Home's words that the shell's Home view adds. "Back to Home" waits on the board's wording pick. */
export const homeViewWords = {
  /** Leads the open item in one pane, back to the list column. */
  back: "Back to Home",
} as const;

/**
 * The list column's width in the rail's layout (HAL-20617 build plan, P3): about a third of the
 * page, at most 380px. Set on the slot, so the column's loading state has it too.
 */
export const homeListColumnClass = "flex w-[34%] max-w-[380px] shrink-0 flex-col";

/** Props for {@link HomeView}. */
export interface HomeViewProps {
  /** The view a feature set with `home.setView`. */
  readonly view: Registered<HomeViewContribution>;
  /** The context of the feature that set it. */
  readonly context: WorkspaceContext;
  /** Home's sections, for the content pane while no item is open. */
  readonly sections: ReactNode;
  /** The page's name while the content pane loads: "Home". */
  readonly name: string;
}

/**
 * Home with a feature's view (`shell.home-view`): its list column beside its content pane, on the
 * framed sidebar the Messenger and the Inbox share. The shell keeps which item is open, so the two
 * slots load apart and still agree. A window under 900px shows one pane at a time: the list, or the
 * open item under "Back to Home". A phone shows Home's sections alone for now, until the phone's
 * one-list Home is designed.
 */
export function HomeView({ view, context, sections, name }: HomeViewProps) {
  const phone = usePresentation() === "phone";
  const { narrow, open, setOpen, column: listColumn, back } = useHomePanes();
  if (phone) return sections;
  const slot = { context, open, setOpen };
  // The pane names the page while it loads; the column says nothing, so "Loading Home" is said once.
  const column = <LoadedView<HomeListColumnProps> view={view.listColumn} props={slot} />;
  const pane = (
    <LoadedView<HomeContentPaneProps>
      view={view.contentPane}
      name={name}
      props={{ ...slot, sections }}
    />
  );
  if (narrow) {
    if (open === undefined) {
      return (
        <div ref={listColumn} className="flex min-w-0 flex-1 flex-col">
          {column}
        </div>
      );
    }
    return (
      <div className="flex min-w-0 flex-1 flex-col">
        <div ref={back} className="px-2 pt-2">
          <Button variant="ghost" size="sm" icon={<BackIcon />} onClick={() => setOpen(undefined)}>
            {homeViewWords.back}
          </Button>
        </div>
        {pane}
      </div>
    );
  }
  // The page already sits in the shell's `main`, so the pane is a plain framed panel.
  return (
    <SidebarFrame sidebar={<div className={homeListColumnClass}>{column}</div>}>
      <FramedPanel>{pane}</FramedPanel>
    </SidebarFrame>
  );
}

/** What can take the keyboard focus in the list column. */
const focusable = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * The open item and the panes' focus. In one pane the list column and the open item replace each
 * other, so the focused row or button would go with them: the focus moves to "Back to Home" when
 * an item opens, as the Runs page's one pane does. When the item closes, the focus moves to its
 * row (the element with its `data-row-id`) while the list column has it, else to the column's
 * first control.
 */
function useHomePanes() {
  const narrow = useNarrow();
  const [open, setOpenState] = useState<string | undefined>(undefined);
  const column = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLDivElement>(null);
  const setOpen = (id: string | undefined) => {
    if (!narrow || id === open) return setOpenState(id);
    flushSync(() => setOpenState(id));
    if (id !== undefined) return back.current?.querySelector<HTMLElement>("button")?.focus();
    const rows = [...(column.current?.querySelectorAll<HTMLElement>("[data-row-id]") ?? [])];
    const row = rows.find((each) => each.getAttribute("data-row-id") === open);
    const target = row?.matches(focusable) ? row : row?.querySelector<HTMLElement>(focusable);
    (target ?? column.current?.querySelector<HTMLElement>(focusable))?.focus();
  };
  return { narrow, open, setOpen, column, back };
}
