import { type KeyboardEvent, type ReactNode, useId, useRef } from "react";
import { usePresentation } from "../presentation/presentation.tsx";
import { useBalancedRows } from "./balanced-rows.ts";
import { FillWidthCopy, TabLabel, TabSignal } from "./tab-extras.tsx";
import { keyTarget, type TabOrientation } from "./tab-keys.ts";
import {
  iconClasses,
  type Layout,
  sizeClasses,
  stateClasses,
  stickyClasses,
  type TabState,
  tabClasses,
  trackClasses,
} from "./tab-styles.ts";

/** The counter on a tab: how many things its view holds, or how many errors it has. */
export interface TabCount {
  readonly value: number;
  /**
   * `danger` when it counts errors, `warning` when it counts what waits for a person ("1 needs
   * you"). The tab itself never turns red.
   */
  readonly tone?: "accent" | "warning" | "danger";
  /** What the number means, read after the tab's name: "2 errors" makes "Configuration, 2 errors". */
  readonly name: string;
}

/** One of the page's views. */
export interface Tab<Id extends string = string> {
  readonly id: Id;
  /** The full label, never shortened: on a phone it wraps instead. */
  readonly label: string;
  /** An optional 16px icon before the label. */
  readonly icon?: ReactNode;
  readonly count?: TabCount;
  /**
   * A still `running` dot after the label while one of the view's runs is running, with its words
   * for screen readers: `{ name: "1 running" }` reads "Runs, 1 running". A `count` wins over it.
   */
  readonly running?: { readonly name: string };
  /** Can't be opened now. It's still shown, but clicks and the arrow keys skip it. */
  readonly disabled?: boolean;
}

/** The ids that tie a `TabList` to its `TabPanel`. Make them with `useTabIds`. */
export interface TabIds {
  readonly base: string;
}

/** New ids for one tab list and its panel. */
export function useTabIds(): TabIds {
  return { base: useId() };
}

function tabElementId(ids: TabIds, id: string): string {
  return `${ids.base}-tab-${id}`;
}

function panelElementId(ids: TabIds): string {
  return `${ids.base}-panel`;
}

/** The props of `TabList`. */
export interface TabListProps<Id extends string = string> {
  /** The name of the tab list: "Workflow views". */
  readonly label: string;
  readonly tabs: readonly Tab<Id>[];
  /** The selected tab's `id`. The page keeps it, so it remembers its tab while it's on the stack. */
  readonly selected: Id;
  readonly onSelect: (id: Id) => void;
  /**
   * Tabs share the page column in equal parts, each at least 48px high and as wide as its longest
   * word, and labels wrap. On by default on a phone (the presentation context), off on desktop. A
   * vertical list ignores it.
   */
  readonly fill?: boolean;
  /**
   * `horizontal` (the default) is the segmented track, moved through with ← and →. `vertical` is a
   * column of rows as wide as its container, beside its panel, moved through with ↑ and ↓: the
   * page lays out the column itself, such as a Configuration page's list of pages.
   */
  readonly orientation?: TabOrientation;
  /** The same ids as the `TabPanel` that shows the selected view. */
  readonly ids: TabIds;
}

/** The props of `TabPanel`. */
export interface TabPanelProps<Id extends string = string> {
  /** The same ids as the `TabList`. */
  readonly ids: TabIds;
  readonly tabs: readonly Tab<Id>[];
  readonly selected: Id;
  /** The selected tab's view. */
  readonly children: ReactNode;
  /** Classes for the panel, such as the ones that make it fill the space under a header. */
  readonly className?: string | undefined;
}

/** The props of `Tabs`. */
export interface TabsProps<Id extends string = string>
  extends Omit<TabListProps<Id>, "ids" | "orientation">,
    Pick<TabPanelProps<Id>, "children"> {
  /** The tabs stay at the top of the scroll area while the page scrolls under them. */
  readonly sticky?: boolean;
}

/**
 * A page's own views: Flow / Configuration / Runs. Arrow keys move between the tabs and select
 * them, Home and End jump, and only the selected tab is in the Tab order. Switching is instant.
 * For a column of pages beside the panel, use `TabList` with `orientation="vertical"`.
 * Not the window tabs in the title bar, which belong to the shell.
 *
 * @example
 * <Tabs
 *   label="Workflow views"
 *   tabs={[
 *     { id: "flow", label: "Flow" },
 *     { id: "configuration", label: "Configuration", count: { value: 2, tone: "danger", name: "2 errors" } },
 *     { id: "runs", label: "Runs" },
 *   ]}
 *   selected={view}
 *   onSelect={setView}
 * >
 *   {view === "flow" ? <Flow /> : …}
 * </Tabs>
 */
export function Tabs<Id extends string>({ sticky = false, children, ...listProps }: TabsProps<Id>) {
  const ids = useTabIds();
  const list = <TabList {...listProps} ids={ids} />;
  return (
    <div>
      {sticky ? <div className={stickyClasses}>{list}</div> : list}
      <TabPanel ids={ids} tabs={listProps.tabs} selected={listProps.selected}>
        {children}
      </TabPanel>
    </div>
  );
}

/**
 * The tab list of `Tabs` on its own, for a page whose views are picked somewhere else than right
 * above them, such as the item page's header. Pair it with a `TabPanel` that takes the same ids.
 *
 * @example
 * const ids = useTabIds();
 * <header><TabList label="Workflow views" tabs={views} selected={view} onSelect={setView} ids={ids} /></header>
 * <TabPanel ids={ids} tabs={views} selected={view}>{content}</TabPanel>
 *
 * @example
 * // A column of pages on the left, the page beside it.
 * <div className="flex">
 *   <nav className="w-52 px-2 py-4"><TabList orientation="vertical" … ids={ids} /></nav>
 *   <TabPanel ids={ids} tabs={pages} selected={page}>{content}</TabPanel>
 * </div>
 */
export function TabList<Id extends string>({
  label,
  tabs,
  selected,
  onSelect,
  fill: fillProp,
  orientation = "horizontal",
  ids,
}: TabListProps<Id>) {
  const layout = useLayout(orientation, fillProp);
  const tabElements = useRef(new Map<Id, HTMLButtonElement>());
  const track = useRef<HTMLDivElement>(null);
  useBalancedRows(track, layout === "fill");

  const enabled = tabs.filter((tab) => tab.disabled !== true);
  // The tab list stays reachable by Tab even when the selected id isn't one of the tabs.
  const focusable = tabs.some((tab) => tab.id === selected) ? selected : enabled[0]?.id;

  const select = (id: Id) => {
    if (id !== selected) {
      onSelect(id);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = keyTarget(event.key, orientation, enabled, focusable);
    if (next === undefined) {
      return;
    }
    event.preventDefault();
    tabElements.current.get(next)?.focus();
    select(next);
  };

  return (
    <div
      ref={track}
      role="tablist"
      aria-label={label}
      aria-orientation={orientation}
      className={trackClasses[layout]}
      onKeyDown={onKeyDown}
    >
      {tabs.map((tab) => {
        const isSelected = tab.id === selected;
        const isDisabled = tab.disabled === true;
        const state = tabState(isSelected, isDisabled);
        return (
          <button
            key={tab.id}
            ref={(element) => {
              if (element === null) {
                tabElements.current.delete(tab.id);
              } else {
                tabElements.current.set(tab.id, element);
              }
            }}
            type="button"
            role="tab"
            id={tabElementId(ids, tab.id)}
            aria-selected={isSelected}
            aria-controls={isSelected ? panelElementId(ids) : undefined}
            aria-disabled={isDisabled ? true : undefined}
            tabIndex={tab.id === focusable ? 0 : -1}
            // An unselected tab shows the muted track, so its counter takes the on-muted: look.
            // The selected tab is a raised surface segment, so its counter keeps the normal look.
            // A vertical list has no track: its rows sit on the page.
            data-fill={isSelected || layout === "vertical" ? undefined : "muted"}
            className={`${tabClasses[layout]} ${sizeClasses[layout]} ${stateClasses[layout][state]}`}
            onClick={() => {
              if (!isDisabled) {
                select(tab.id);
              }
            }}
          >
            {tab.icon === undefined ? null : (
              <span className={iconClasses[layout]} aria-hidden="true">
                {tab.icon}
              </span>
            )}
            <TabLabel label={tab.label} layout={layout} />
            <TabSignal tab={tab} fill={layout === "fill"} />
            {layout === "fill" ? <FillWidthCopy label={tab.label} /> : null}
          </button>
        );
      })}
    </div>
  );
}

/** The one `tabpanel` that holds the selected view, labelled by the selected tab. */
export function TabPanel<Id extends string>({
  ids,
  tabs,
  selected,
  children,
  className,
}: TabPanelProps<Id>) {
  return (
    <div
      role="tabpanel"
      id={panelElementId(ids)}
      className={className}
      aria-labelledby={
        tabs.some((tab) => tab.id === selected) ? tabElementId(ids, selected) : undefined
      }
    >
      {children}
    </div>
  );
}

/** The look a tab list takes: a vertical list is always rows; a row of tabs fills on a phone. */
function useLayout(orientation: TabOrientation, fill: boolean | undefined): Layout {
  const presentation = usePresentation();
  if (orientation === "vertical") {
    return "vertical";
  }
  return (fill ?? presentation === "phone") ? "fill" : "inline";
}

function tabState(isSelected: boolean, isDisabled: boolean): TabState {
  if (isSelected) {
    return "selected";
  }
  return isDisabled ? "disabled" : "default";
}
