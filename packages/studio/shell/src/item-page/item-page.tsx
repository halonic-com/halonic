import { type MenuItem, type Tab, TabPanel, useTabIds } from "@halonicjs/studio-kit";
import {
  type ReactNode,
  type Ref,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { CloseStack } from "../close-stack/close-stack.ts";
import { useBackLinkSlot } from "../page/back-link-slot.tsx";
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
  /**
   * Draws the chat. `close` hides it again, back to "Ask about this <kind>…". `panelShown` says
   * whether the panel shows beside the chat, so a chat can leave a state the panel already shows,
   * such as the item's loading, to the panel.
   */
  readonly render: (close: () => void, panelShown: boolean) => ReactNode;
}

/** What a page can ask of its {@link ItemPage}, through `handle`. */
export interface ItemPageHandle<Id extends string> {
  /**
   * Shows `view` as if the user had picked it, such as for a link in the chat: the shell remembers
   * it for the tab, reopens a panel the user closed, opens the panel's own screen in a narrow tab,
   * and moves focus to `focus()`'s element once the view is drawn, or else to the panel.
   */
  show(view: Id, focus?: () => HTMLElement | null): void;
}

/** Props for {@link ItemPage}. */
export interface ItemPageProps<Id extends string> {
  /** The kind's 16px icon. */
  readonly icon: ReactNode;
  /** The kind as a word: "Workflow". */
  readonly kind: string;
  readonly name: string;
  readonly onRename: (name: string) => void;
  /** Checks a new name as it is typed: why it can't be kept, or `undefined` when it can. */
  readonly check?: ((name: string) => string | undefined) | undefined;
  /** The page's `h1`, for a page that moves the focus to its title. */
  readonly titleRef?: Ref<HTMLHeadingElement> | undefined;
  readonly actions?: readonly MenuItem[] | undefined;
  /** The page's views, in the header's order. */
  readonly views: readonly [Tab<Id>, ...Tab<Id>[]];
  /** The view a tab shows when it first opens the item; the first of `views` when unset. */
  readonly firstView?: Id | undefined;
  /** Lets the page show a view itself, such as from a link in its chat. */
  readonly handle?: Ref<ItemPageHandle<Id>> | undefined;
  /** Hears the view the user picks in the header. */
  readonly onPickView?: ((view: Id) => void) | undefined;
  /** The item's own controls in the header's right end: ▶ Run. */
  readonly end?: ReactNode;
  /** A line across the tab under the header, over the chat and the panel: "Changes not live yet". */
  readonly notice?: ReactNode;
  /** The chat about the item, when a feature provides one for the kind. */
  readonly chat?: ItemPageChat | undefined;
  /** The window's close stack: Esc puts a maximised panel back beside the chat. */
  readonly closeStack?: CloseStack | undefined;
  /** Draws the view that's picked. */
  readonly children: (view: Id) => ReactNode;
}

/**
 * Where focus goes once the page has drawn the layout a control asked for; `panel` with the
 * element a shown view names, else the panel itself.
 */
type FocusTarget =
  | "views"
  | "chat"
  | "ask"
  | "show-panel"
  | "back-to-chat"
  | "maximise"
  | { readonly panel: (() => HTMLElement | null) | undefined };

/** The page's element for `target`, its header controls found by their ids under `idBase`. */
function focusTarget(page: HTMLElement, idBase: string, target: FocusTarget): HTMLElement | null {
  if (typeof target === "object") {
    return target.panel?.() ?? document.getElementById(`${idBase}-panel`);
  }
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
  notice,
  firstView,
  handle,
  onPickView,
  ...header
}: ItemPageProps<Id>) {
  const tabIds = useTabIds();
  const backLink = useBackLinkSlot();
  const [view, remember] = useRememberedView(
    views.map((candidate) => candidate.id),
    firstView ?? views[0].id,
  );
  const pick = (next: Id) => {
    remember(next);
    onPickView?.(next);
  };
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
  // A view the page shows has to be seen: focus never lands on something hidden (flow-agents 3.4).
  // The handle stays the same object, so it reads the layout of the latest render.
  const latest = useRef({ layout, remember });
  latest.current = { layout, remember };
  useImperativeHandle(
    handle,
    () => ({
      show: (next, focusOn) => {
        latest.current.remember(next);
        setChoices((current) => ({ ...current, ...revealPanel(latest.current.layout) }));
        setFocus({ panel: focusOn });
      },
    }),
    [],
  );
  const viewLabel = views.find((candidate) => candidate.id === view)?.label ?? views[0].label;
  const shown = shownParts(layout);

  return (
    // The tab's page is the scroller (TabPages), so the header stays at its top while a full-width
    // view scrolls under it. Where the chat shows, the chat and the panel each scroll on their own.
    <div ref={page} className={shown.chat ? "flex h-full flex-col" : "flex min-h-full flex-col"}>
      {backLink}
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
      {notice}
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
            {chat.render(() => change({ chatOpen: false }, "ask"), shown.panel)}
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
          tabIndex={-1}
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

/** The choices that bring the panel into view: back beside the chat, or as its own screen. */
function revealPanel(layout: ItemLayout): Partial<ChosenLayout> {
  if (layout.shows !== "chat") return {};
  return layout.panelControl === "reopen" ? { panelClosed: false } : { panelScreen: true };
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
    return "absolute inset-28 min-h-0 overflow-y-auto rounded-md border border-border bg-surface shadow-3 outline-none";
  }
  return split
    ? "min-h-0 shrink-0 overflow-y-auto border-s border-border outline-none"
    : "outline-none";
}
