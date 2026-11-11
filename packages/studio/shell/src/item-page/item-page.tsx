import { type MenuItem, type Tab, TabPanel, useTabIds } from "@halonicjs/studio-kit";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import type { CloseStack } from "../close-stack/close-stack.ts";
import { panelEdgeLimits } from "../panels/panel-width.ts";
import { usePanelWidth } from "../panels/panel-width-context.tsx";
import { ResizeEdge } from "../resize/resize-edge.tsx";
import { useElementWidth } from "./element-width.ts";
import { ItemHeader } from "./item-header.tsx";
import { type ItemLayout, type ItemLayoutChoices, itemLayout } from "./item-layout.ts";
import { useMaximiseLayer } from "./maximise-layer.ts";
import { PanelControls } from "./panel-controls.tsx";
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
  /** The window's close stack: Esc puts a maximised panel back beside the chat. */
  readonly closeStack?: CloseStack | undefined;
  /** Draws the view that's picked. */
  readonly children: (view: Id) => ReactNode;
}

/** Where focus goes once the page has drawn the layout a control asked for. */
type FocusTarget = "views" | "chat" | "ask" | "show-panel" | "back-to-chat" | "maximise";

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
 * on the right, which ✕ hides and a narrow tab turns into a button (`shell.item-page-chat`). The
 * panel's left edge resizes it, for every item page in the window (`shell.panel-width`), and its ⤢
 * lets it cover the tab while the chat steps back (`shell.panel-maximise`).
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
  closeStack,
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
  const [panelWidth, resizePanel, savePanelWidth] = usePanelWidth();
  // Until the user opens or closes the chat, it follows `startsOpen`, so a chat that arrives after
  // the first render still starts open.
  const [choices, setChoices] = useState<ChosenLayout>({
    panelClosed: false,
    panelScreen: false,
    maximised: false,
  });
  const [focus, setFocus] = useState<FocusTarget | undefined>(undefined);
  const layout = itemLayout(
    {
      hasChat: chat !== undefined,
      ...choices,
      chatOpen: choices.chatOpen ?? chat?.startsOpen ?? false,
    },
    panelWidth,
    tabWidth,
  );
  // Only a panel beside the chat can cover the tab; one shown as a button has no ⤢.
  const besideTheChat = layout.shows === "chat-and-panel";
  const maximised = choices.maximised && besideTheChat;
  useMaximiseLayer(maximised, closeStack, page, () =>
    setChoices((current) => ({ ...current, maximised: false })),
  );
  // A tab too narrow for the panel beside the chat ends maximise, so widening it again shows the
  // chat rather than covering it by surprise (Liam's review of #1610, HAL-4976).
  useEffect(() => {
    if (!besideTheChat) {
      setChoices((current) => (current.maximised ? { ...current, maximised: false } : current));
    }
  }, [besideTheChat]);

  // A control that swaps the layout leaves focus on nothing, so it goes to what took its place.
  useEffect(() => {
    if (focus !== undefined && page.current !== null) {
      focusTarget(page.current, idBase, focus)?.focus();
      setFocus(undefined);
    }
  }, [focus, idBase]);

  const change = (next: Partial<ChosenLayout>, then: FocusTarget) => {
    setChoices((current) => ({ ...current, ...next }));
    setFocus(then);
  };
  const viewLabel = views.find((candidate) => candidate.id === view)?.label ?? views[0].label;
  const shown = shownParts(layout);

  return (
    // The tab's page is the scroller (TabPages), so the header stays at its top while a full-width
    // view scrolls under it. Where the chat shows, the chat and the panel each scroll on their own.
    <div ref={page} className={shown.chat ? "flex h-full flex-col" : "flex min-h-full flex-col"}>
      <ItemHeader
        {...header}
        views={views}
        view={view}
        onPickView={pick}
        tabIds={tabIds}
        viewsShown={shown.panel}
        end={
          <>
            {end}
            <PanelControls
              layout={layout}
              maximised={maximised}
              idBase={idBase}
              kind={header.kind}
              viewLabel={viewLabel}
              onAsk={() => change({ chatOpen: true }, "chat")}
              onToggleMaximise={() =>
                setChoices((current) => ({ ...current, maximised: !maximised }))
              }
              onClosePanel={() => change({ panelClosed: true, maximised: false }, "show-panel")}
              onReopenPanel={() => change({ panelClosed: false }, "views")}
              onPanelScreen={() => change({ panelScreen: true }, "views")}
              onBackToChat={() => change({ panelScreen: false }, "show-panel")}
            />
          </>
        }
      />
      {/* The chat and the panel keep their places in every layout and are hidden rather than
          moved, so switching layouts keeps a half-typed message or the canvas's zoom. */}
      <div className={bodyClasses(layout)}>
        {chat === undefined ? null : (
          <section
            aria-label="Chat"
            data-item-chat=""
            tabIndex={-1}
            hidden={!shown.chat}
            inert={maximised}
            className={chatClasses(layout)}
          >
            {chat.render(() => change({ chatOpen: false }, "ask"))}
          </section>
        )}
        {maximised ? (
          // For the pointer only: the keyboard restores with Esc or the restore mark.
          <div
            aria-hidden="true"
            data-maximise-margin=""
            className="absolute inset-0 bg-(--stack-scrim)"
            onClick={() => change({ maximised: false }, "maximise")}
          />
        ) : null}
        {layout.shows === "chat-and-panel" && !maximised ? (
          <ResizeEdge
            label="Resize panel"
            controls={`${idBase}-panel`}
            width={layout.panelWidth}
            limits={panelEdgeLimits(tabWidth)}
            side="start"
            onResize={resizePanel}
            onResizeEnd={savePanelWidth}
          />
        ) : null}
        <div
          id={`${idBase}-panel`}
          hidden={!shown.panel}
          className={panelClasses(shown.split, maximised)}
          style={
            layout.shows === "chat-and-panel" && !maximised
              ? { width: layout.panelWidth }
              : undefined
          }
        >
          <TabPanel ids={tabIds} tabs={views} selected={view}>
            {children(view)}
          </TabPanel>
        </div>
      </div>
    </div>
  );
}

/**
 * What the user chose for the chat and the panel; `chatOpen` is unset until they open or close it.
 * `maximised` counts only while the panel is beside the chat.
 */
type ChosenLayout = Omit<ItemLayoutChoices, "chatOpen"> & {
  readonly chatOpen?: boolean;
  readonly maximised: boolean;
};

/** Which of the chat and the panel `layout` shows, and whether they share the tab side by side. */
function shownParts(layout: ItemLayout): {
  readonly chat: boolean;
  readonly panel: boolean;
  readonly split: boolean;
} {
  return {
    chat: layout.shows === "chat" || layout.shows === "chat-and-panel",
    panel: layout.shows !== "chat",
    split: layout.shows === "chat-and-panel",
  };
}

function bodyClasses(layout: ItemLayout): string {
  switch (layout.shows) {
    case "chat-and-panel":
      // The maximised panel and its margin are placed over this box.
      return "relative flex min-h-0 flex-1";
    case "chat":
      return "flex min-h-0 flex-1 flex-col";
    default:
      return "flex flex-1 flex-col";
  }
}

function chatClasses(layout: ItemLayout): string {
  if (layout.shows === "chat-and-panel") {
    return "flex min-h-0 min-w-0 flex-1 flex-col outline-none";
  }
  // Without the panel the chat takes the middle of the tab at reading width. While hidden it sets
  // no display, so the `hidden` attribute hides it.
  return layout.shows === "chat"
    ? "mx-auto flex min-h-0 w-full max-w-reading flex-1 flex-col outline-none"
    : "outline-none";
}

/**
 * Beside the chat, the panel keeps its width with a line on its left. Maximised, it covers the tab's
 * body inside a 112px margin (`inset-28`), as its own surface over the dimmed chat.
 */
function panelClasses(split: boolean, maximised: boolean): string {
  if (maximised) {
    return "absolute inset-28 min-h-0 overflow-y-auto rounded-md border border-border bg-surface shadow-3";
  }
  return split ? "min-h-0 shrink-0 overflow-y-auto border-s border-border" : "";
}
