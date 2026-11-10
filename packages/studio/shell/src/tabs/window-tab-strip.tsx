import { Button, CloseIcon, PlusIcon } from "@halonicjs/studio-kit";
import {
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { dragTargetIndex, TAB_DRAG_THRESHOLD, type TabSpan } from "./tab-drag.ts";
import { currentLocation, type TabLocation, type TabSet, type WindowTab } from "./tab-set.ts";

/** Props for {@link WindowTabStrip}. */
export interface WindowTabStripProps {
  /** The open workspace's tabs. */
  readonly tabs: TabSet;
  /** The 16px icon for a tab's place or item kind. */
  readonly iconFor?: ((location: TabLocation) => ReactNode) | undefined;
  /** Whether the item a tab shows waits for a person: the tab gets the needs-you dot. */
  readonly needsYou?: ((location: TabLocation) => boolean) | undefined;
  /** Called after **+** opened a new tab on Home, so the frame can open the Ctrl K palette there. */
  readonly onNewTab?: ((tab: WindowTab) => void) | undefined;
}

/**
 * The window tabs in the title bar (component specs 24.5): one `tablist` named "Open tabs" and one
 * Tab stop. ← and → move the focus, Enter or Space opens the focused tab, Delete closes it, and
 * Ctrl Shift PageUp and PageDown move it. Dragging a tab moves it too, with no motion: it jumps
 * to its new place as the pointer crosses a neighbour's middle. Tabs are 200px, shrink together to 96px, and then the
 * strip scrolls sideways with the active tab kept in view. **+** after the last tab opens a new
 * tab on Home.
 *
 * Nothing on a tab is `fg-subtle`, which reaches only 4.46:1 on the hovered tab.
 *
 * @example
 * <ShellFrame titleBar={<WindowTabStrip tabs={workspace.tabs} />} …>
 */
export function WindowTabStrip({ tabs, iconFor, needsYou, onNewTab }: WindowTabStripProps) {
  const state = useSyncExternalStore(
    (listener) => tabs.subscribe(listener),
    () => tabs.state,
  );
  const elements = useRef(new Map<string, HTMLDivElement>());
  // The tab that has the focus while it is in the strip. Outside the strip, or when the focused tab
  // has closed, the active tab is the Tab stop, even when it changed from outside (the sidebar).
  const [focusedId, setFocusedId] = useState<string | undefined>(undefined);
  const rovingId = state.tabs.find((tab) => tab.id === focusedId)?.id ?? state.activeId;
  const startDrag = useTabDrag(tabs, elements);

  useEffect(() => {
    elements.current.get(state.activeId)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [state.activeId]);

  const focusTab = (tabId: string) => {
    setFocusedId(tabId);
    elements.current.get(tabId)?.focus();
  };

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setFocusedId(undefined);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const key = stripKey(event);
    if (key === undefined) {
      return;
    }
    event.preventDefault();
    const focusNext = runStripKey(tabs, rovingId, key);
    if (focusNext !== undefined) {
      focusTab(focusNext);
    }
  };

  return (
    <>
      <div
        role="tablist"
        aria-label="Open tabs"
        className={stripClasses}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
      >
        {state.tabs.map((tab) => (
          <WindowTabView
            key={tab.id}
            tab={tab}
            active={tab.id === state.activeId}
            focusable={tab.id === rovingId}
            icon={iconFor?.(currentLocation(tab))}
            needsYou={needsYou?.(currentLocation(tab)) ?? false}
            elementRef={(element) => {
              if (element === null) {
                elements.current.delete(tab.id);
              } else {
                elements.current.set(tab.id, element);
              }
            }}
            onFocus={() => setFocusedId(tab.id)}
            onPointerDown={(event) => startDrag(tab.id, event)}
            onActivate={() => tabs.activate(tab.id)}
            onClose={() => tabs.close(tab.id)}
          />
        ))}
      </div>
      <div className="shrink-0 self-center">
        <Button
          variant="ghost"
          size="sm"
          icon={<PlusIcon />}
          label="New tab"
          onClick={() => onNewTab?.(tabs.newTab())}
        />
      </div>
    </>
  );
}

/**
 * The strip scrolls sideways, and a scroller clips on all four sides. Its 8px padding at both ends
 * and 1px at the foot, cancelled by negative margins, keep the active tab's foot curves and its
 * 1px overlap with the panel's top border inside the scroller's box, while the tabs stay where the
 * title bar puts them.
 */
const stripClasses = [
  "-mx-2 -mb-px flex min-w-0 items-end self-end overflow-x-auto px-2 pb-px",
  "[scrollbar-width:none]",
].join(" ");

/**
 * Dragging a tab by its pointer: a press that moves more than `TAB_DRAG_THRESHOLD` moves the tab
 * as the pointer crosses its neighbours' middles, until the pointer is released. The window
 * follows the pointer, not the tab, because moving the tab in the DOM would drop a pointer capture.
 * Only the main button drags; a middle-click is left alone.
 */
function useTabDrag(
  tabs: TabSet,
  elements: RefObject<Map<string, HTMLDivElement>>,
): (tabId: string, event: PointerEvent) => void {
  return (tabId, event) => {
    if (event.button !== 0) {
      return;
    }
    const startX = event.clientX;
    let dragging = false;
    const onMove = (move: globalThis.PointerEvent) => {
      dragging ||= Math.abs(move.clientX - startX) >= TAB_DRAG_THRESHOLD;
      if (!dragging) {
        return;
      }
      const order = tabs.state.tabs;
      const spans = order.map((tab) => spanOf(elements.current.get(tab.id)));
      const from = order.findIndex((tab) => tab.id === tabId);
      tabs.move(tabId, dragTargetIndex(move.clientX, spans, from));
    };
    const stop = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };
}

function spanOf(element: HTMLElement | undefined): TabSpan {
  const box = element?.getBoundingClientRect();
  return { left: box?.left ?? 0, width: box?.width ?? 0 };
}

/** What a key does in the strip, or `undefined` when the strip leaves it alone. */
type StripKey = "previous" | "next" | "activate" | "close" | "move-left" | "move-right";

function stripKey(event: KeyboardEvent): StripKey | undefined {
  const plain = !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
  if (event.ctrlKey && event.shiftKey && event.key === "PageUp") {
    return "move-left";
  }
  if (event.ctrlKey && event.shiftKey && event.key === "PageDown") {
    return "move-right";
  }
  if (!plain) {
    return undefined;
  }
  const keys: Record<string, StripKey> = {
    ArrowLeft: "previous",
    ArrowRight: "next",
    Enter: "activate",
    " ": "activate",
    Delete: "close",
  };
  return keys[event.key];
}

/**
 * Does what `key` asks with the focused tab `tabId`, and returns the tab the focus goes to, or
 * `undefined` when it stays. After a close the focus goes to the tab that became active, or to
 * the one now in the closed tab's place.
 */
function runStripKey(tabs: TabSet, tabId: string, key: StripKey): string | undefined {
  const before = tabs.state;
  const index = before.tabs.findIndex((tab) => tab.id === tabId);
  switch (key) {
    case "previous":
    case "next":
      return before.tabs[index + (key === "next" ? 1 : -1)]?.id;
    case "activate":
      tabs.activate(tabId);
      return undefined;
    case "close": {
      tabs.close(tabId);
      const after = tabs.state;
      const inItsPlace = after.tabs[Math.min(index, after.tabs.length - 1)] as WindowTab;
      return tabId === before.activeId ? after.activeId : inItsPlace.id;
    }
    case "move-left":
    case "move-right":
      tabs.move(tabId, index + (key === "move-right" ? 1 : -1));
      return tabId;
  }
}

interface WindowTabViewProps {
  readonly tab: WindowTab;
  readonly active: boolean;
  readonly focusable: boolean;
  readonly icon: ReactNode;
  readonly needsYou: boolean;
  readonly elementRef: (element: HTMLDivElement | null) => void;
  readonly onFocus: () => void;
  readonly onPointerDown: (event: PointerEvent) => void;
  readonly onActivate: () => void;
  readonly onClose: () => void;
}

/**
 * An inactive tab has no fill, so the frame shows through; hovered, it takes `bg-tab-hover`. A
 * 1px line separates two inactive tabs, hidden next to the active or a hovered tab. The active
 * tab is the `surface` with a border on three sides, 1px taller so it covers the panel's top
 * border, with the 2px halo line along its top and two 8px curves at its foot where it joins the
 * panel.
 */
const tabClasses = {
  common: [
    "group relative flex w-50 min-w-24 shrink cursor-default select-none items-center gap-2 rounded-t-sm",
    "ps-3 pe-1.5 text-small outline-none focus-ring-inset",
  ].join(" "),
  inactive: [
    "h-[34px] text-fg-muted hover:bg-tab-hover hover:text-fg",
    "not-first:before:absolute not-first:before:start-0 not-first:before:h-4 not-first:before:w-px",
    "not-first:before:bg-border-strong hover:before:hidden [:hover+&]:before:hidden",
    "[[aria-selected=true]+&]:before:hidden",
  ].join(" "),
  active: [
    "z-10 -mb-px h-[35px] border border-b-0 border-border bg-surface font-medium text-fg",
    "forced-colors:border-[CanvasText]",
  ].join(" "),
} as const;

/** The two 8px inward curves at the active tab's foot, filled with `surface` outside a circle. */
const footCurve = "pointer-events-none absolute bottom-0 size-2";
const footCurves = {
  start: `${footCurve} -start-2 bg-[radial-gradient(circle_at_0_0,transparent_8px,var(--color-surface)_8px)]`,
  end: `${footCurve} -end-2 bg-[radial-gradient(circle_at_100%_0,transparent_8px,var(--color-surface)_8px)]`,
} as const;

function WindowTabView(props: WindowTabViewProps) {
  const { tab, active, focusable, icon, needsYou } = props;
  const location = currentLocation(tab);
  const name = [location.title, location.kind, needsYou ? "needs you" : undefined]
    .filter((part) => part !== undefined)
    .join(", ");

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the tablist takes the keys for every tab (Enter, Space, Delete)
    <div
      ref={props.elementRef}
      role="tab"
      aria-selected={active}
      aria-label={name}
      tabIndex={focusable ? 0 : -1}
      data-tab-id={tab.id}
      className={`${tabClasses.common} ${active ? tabClasses.active : tabClasses.inactive}`}
      onFocus={props.onFocus}
      onPointerDown={props.onPointerDown}
      onClick={props.onActivate}
    >
      {active ? (
        <>
          <span
            aria-hidden="true"
            className="absolute inset-x-0 -top-px h-0.5 rounded-t-sm bg-halo-line forced-colors:bg-[Highlight]"
          />
          <span aria-hidden="true" className={footCurves.start} />
          <span aria-hidden="true" className={footCurves.end} />
        </>
      ) : null}
      {icon === undefined ? null : (
        <span
          aria-hidden="true"
          className={`inline-grid size-icon-sm shrink-0 place-items-center *:size-full ${active ? "text-accent" : ""}`}
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{location.title}</span>
      {needsYou ? (
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full bg-warning forced-color-adjust-none"
        />
      ) : null}
      <CloseTabButton
        title={location.title}
        shown={active}
        onClose={(event) => {
          event.stopPropagation();
          props.onClose();
        }}
      />
    </div>
  );
}

interface CloseTabButtonProps {
  readonly title: string;
  /** Always shown on the active tab; on the others only on hover and keyboard focus. */
  readonly shown: boolean;
  readonly onClose: (event: { stopPropagation(): void }) => void;
}

/**
 * The 20px ✕. It keeps its place on every tab, shown or not, so nothing moves on hover. It's not a
 * Tab stop of its own: the strip is one, and Delete closes the focused tab. A click doesn't move
 * the focus to it, so the focus doesn't fall to the page when the button goes with its tab.
 *
 * A `tab`'s children are presentational, so screen readers don't announce the button's name;
 * Delete is the way to close a tab for them.
 */
function CloseTabButton({ title, shown, onClose }: CloseTabButtonProps) {
  const visibility = shown ? "" : "invisible group-hover:visible group-focus-visible:visible";
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={`Close ${title}`}
      className={`inline-grid size-5 shrink-0 place-items-center rounded-xs text-fg-muted hover:bg-surface-muted hover:text-fg ${visibility}`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClose}
    >
      <span aria-hidden="true" className="size-icon-sm *:size-full">
        <CloseIcon />
      </span>
    </button>
  );
}
