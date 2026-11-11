import {
  BackIcon,
  Button,
  CloseIcon,
  type MenuItem,
  type Tab,
  TabPanel,
  useTabIds,
} from "@halonicjs/studio-kit";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { PANEL_DEFAULT_WIDTH } from "../panels/panel-width.ts";
import { useElementWidth } from "./element-width.ts";
import { ItemHeader } from "./item-header.tsx";
import { type ItemLayout, type ItemLayoutChoices, itemLayout } from "./item-layout.ts";
import { useRememberedView } from "./remembered-view.ts";

/** The chat a feature provides for a kind's item page, beside the panel that shows the view. */
export interface ItemPageChat {
  /** Open from the start (agents, workflows); otherwise the header offers "Ask about this <kind>…". */
  readonly startsOpen: boolean;
  /** Draws the chat. `close` hides it again, back to "Ask about this <kind>…". */
  readonly render: (close: () => void) => ReactNode;
}

/** Props for {@link ItemPage}. */
export interface ItemPageProps<Id extends string> {
  /** The kind's 16px icon. */
  readonly icon: ReactNode;
  /** The kind as a word: "Workflow". */
  readonly kind: string;
  readonly name: string;
  readonly onRename: (name: string) => void;
  readonly actions?: readonly MenuItem[] | undefined;
  /** The page's views, the first one shown when the tab first opens the item. */
  readonly views: readonly [Tab<Id>, ...Tab<Id>[]];
  /** The item's own controls in the header's right end: ▶ Run. */
  readonly end?: ReactNode;
  /** The chat about the item, when a feature provides one for the kind. */
  readonly chat?: ItemPageChat | undefined;
  /** Draws the view that's picked. */
  readonly children: (view: Id) => ReactNode;
}

/** Where focus goes once the page has drawn the layout a control asked for. */
type FocusTarget = "views" | "chat" | "ask" | "show-panel" | "back-to-chat";

/** The page's element for `target`, its header controls found by their ids under `idBase`. */
function focusTarget(page: HTMLElement, idBase: string, target: FocusTarget): HTMLElement | null {
  switch (target) {
    case "views":
      return page.querySelector<HTMLElement>('header [role="tab"][aria-selected="true"]');
    case "chat":
      return page.querySelector<HTMLElement>("[data-item-chat]");
    default:
      return document.getElementById(`${idBase}-${target}`);
  }
}

/**
 * The frame of an agent's, a workflow's or another item's page (UX checklist 1.10), for the
 * features to draw their item pages in: the tab header, and one view at a time under it, picked
 * in the header's views nav and remembered for the tab (req-shell `panels.one-view-at-a-time`).
 * When a feature provides a `chat` for the kind, the chat sits on the left and the view in a panel
 * on the right, which ✕ hides and a narrow tab turns into a button (`shell.item-page-chat`).
 * Without one, the view takes the full width.
 *
 * @example
 * <ItemPage
 *   icon={<WorkflowIcon />}
 *   kind="Workflow"
 *   name={workflow.name}
 *   onRename={rename}
 *   views={[{ id: "flow", label: "Flow" }, { id: "configuration", label: "Configuration" }]}
 *   end={<RunButton />}
 * >
 *   {(view) => (view === "flow" ? <Flow /> : <Configuration />)}
 * </ItemPage>
 */
export function ItemPage<Id extends string>({
  views,
  children,
  chat,
  end,
  ...header
}: ItemPageProps<Id>) {
  const tabIds = useTabIds();
  const [view, pick] = useRememberedView(
    views.map((candidate) => candidate.id),
    views[0].id,
  );
  const page = useRef<HTMLDivElement>(null);
  const idBase = useId();
  const tabWidth = useElementWidth(page);
  const [choices, setChoices] = useState<ItemLayoutChoices>(() => ({
    chatOpen: chat?.startsOpen ?? false,
    panelClosed: false,
    panelScreen: false,
  }));
  const [focus, setFocus] = useState<FocusTarget | undefined>(undefined);
  const layout = itemLayout(
    { hasChat: chat !== undefined, ...choices },
    PANEL_DEFAULT_WIDTH,
    tabWidth,
  );

  // A control that swaps the layout leaves focus on nothing, so it goes to what took its place.
  useEffect(() => {
    if (focus !== undefined && page.current !== null) {
      focusTarget(page.current, idBase, focus)?.focus();
      setFocus(undefined);
    }
  }, [focus, idBase]);

  const change = (next: Partial<ItemLayoutChoices>, then: FocusTarget) => {
    setChoices((current) => ({ ...current, ...next }));
    setFocus(then);
  };
  const viewLabel = views.find((candidate) => candidate.id === view)?.label ?? views[0].label;
  const panel = (
    <TabPanel ids={tabIds} tabs={views} selected={view}>
      {children(view)}
    </TabPanel>
  );
  const chatColumn =
    chat === undefined ? null : (
      <section aria-label="Chat" data-item-chat="" tabIndex={-1} className={chatClasses(layout)}>
        {chat.render(() => change({ chatOpen: false }, "ask"))}
      </section>
    );

  return (
    // The tab's page is the scroller (TabPages), so the header stays at its top while a full-width
    // view scrolls under it. Beside a chat, the chat and the panel each scroll on their own.
    <div
      ref={page}
      className={layout.shows === "view" ? "flex min-h-full flex-col" : "flex h-full flex-col"}
    >
      <ItemHeader
        {...header}
        views={views}
        view={view}
        onPickView={pick}
        tabIds={tabIds}
        viewsShown={layout.shows !== "chat"}
        end={
          <>
            {end}
            <PanelControls
              layout={layout}
              idBase={idBase}
              kind={header.kind}
              viewLabel={viewLabel}
              onAsk={() => change({ chatOpen: true }, "chat")}
              onClosePanel={() => change({ panelClosed: true }, "show-panel")}
              onReopenPanel={() => change({ panelClosed: false }, "views")}
              onPanelScreen={() => change({ panelScreen: true }, "views")}
              onBackToChat={() => change({ panelScreen: false }, "show-panel")}
            />
          </>
        }
      />
      {layout.shows === "view" || layout.shows === "panel-screen" ? panel : null}
      {layout.shows === "chat" ? chatColumn : null}
      {layout.shows === "chat-and-panel" ? (
        <div className="flex min-h-0 flex-1">
          {chatColumn}
          <div
            className="min-h-0 shrink-0 overflow-y-auto border-s border-border"
            style={{ width: layout.panelWidth }}
          >
            {panel}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function chatClasses(layout: ItemLayout): string {
  // Without the panel the chat takes the middle of the tab at reading width.
  return layout.shows === "chat"
    ? "mx-auto flex min-h-0 w-full max-w-reading flex-1 flex-col outline-none"
    : "flex min-h-0 min-w-0 flex-1 flex-col outline-none";
}

interface PanelControlsProps {
  readonly layout: ItemLayout;
  readonly idBase: string;
  readonly kind: string;
  readonly viewLabel: string;
  readonly onAsk: () => void;
  readonly onClosePanel: () => void;
  readonly onReopenPanel: () => void;
  readonly onPanelScreen: () => void;
  readonly onBackToChat: () => void;
}

/** The header's control for the chat and the panel, after the item's own: one at a time. */
function PanelControls({ layout, idBase, kind, viewLabel, ...on }: PanelControlsProps) {
  switch (layout.shows) {
    case "view":
      return layout.ask ? (
        <Button variant="secondary" size="sm" id={`${idBase}-ask`} onClick={on.onAsk}>
          {`Ask about this ${kind.toLowerCase()}…`}
        </Button>
      ) : null;
    case "chat-and-panel":
      return (
        <Button
          variant="ghost"
          size="sm"
          icon={<CloseIcon />}
          label={`Close ${viewLabel}`}
          onClick={on.onClosePanel}
        />
      );
    case "chat":
      return (
        <Button
          variant="secondary"
          size="sm"
          id={`${idBase}-show-panel`}
          onClick={layout.panelControl === "reopen" ? on.onReopenPanel : on.onPanelScreen}
        >
          {viewLabel}
        </Button>
      );
    case "panel-screen":
      return (
        <Button
          variant="ghost"
          size="sm"
          icon={<BackIcon />}
          id={`${idBase}-back-to-chat`}
          onClick={on.onBackToChat}
        >
          Chat
        </Button>
      );
  }
}
