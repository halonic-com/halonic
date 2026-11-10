import { type KeyboardEvent, type ReactNode, useId, useRef } from "react";
import { usePresentation } from "../presentation/presentation.tsx";
import { StatusChip } from "../status-chip/status-chip.tsx";

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
   * Tabs share the page column in equal parts, at least 48px high, and labels wrap. On by default
   * on a phone (the presentation context), off on desktop.
   */
  readonly fill?: boolean;
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
}

/** The props of `Tabs`. */
export interface TabsProps<Id extends string = string>
  extends Omit<TabListProps<Id>, "ids">,
    Pick<TabPanelProps<Id>, "children"> {
  /** The tabs stay at the top of the scroll area while the page scrolls under them. */
  readonly sticky?: boolean;
}

const trackClasses = {
  inline: "inline-flex max-w-full gap-0.5 rounded-sm bg-surface-muted p-0.5",
  fill: "flex w-full gap-0.5 rounded-sm bg-surface-muted p-0.5",
} as const;

const stickyClasses = "sticky top-0 z-(--layer-sticky) bg-surface";

const tabClasses = "rounded-segment text-small transition-colors focus-ring";

/**
 * On desktop a tab is as wide as its label. On a touch screen it renders at 40px with a 48px hit
 * area, like a small button.
 */
const sizeClasses = {
  // On one line at normal text. When the track is wider than its column (200% text), the labels
  // wrap inside their tabs rather than overflow; the track keeps the tabs one height.
  inline: [
    "inline-flex min-h-control-sm min-w-0 items-center gap-1.5 px-3",
    "text-center hyphens-auto wrap-break-word",
    "touch:min-h-control-lg touch:hit-touch",
  ].join(" "),
  // The label wraps between words and the counter follows it like one more word. A word longer
  // than its tab breaks with a hyphen, or without one where there's no hyphenation dictionary.
  fill: "min-h-touch min-w-0 flex-1 basis-0 px-2 py-1 text-center hyphens-auto wrap-break-word",
} as const;

/** The selected label's weight. `InlineLabel`'s width copy uses it too, so the two never drift. */
const selectedWeight = "font-medium";

const stateClasses = {
  // selected-forced is the selected tab's edge in high contrast, which drops the fill and the
  // shadow (component specs 23 A11, 23.5). The focus ring's own outline wins on focus.
  selected: `bg-surface ${selectedWeight} text-fg shadow-1 selected-forced`,
  default: "text-fg-muted hover:text-fg",
  disabled: "cursor-not-allowed text-fg-disabled text-forced-disabled",
} as const;

const iconSlot = "inline-grid size-icon-sm shrink-0 place-items-center *:size-full";

/**
 * In `fill` the tab is laid out as text so the label can wrap, so the icon needs its own gap: the
 * same 6px as the `gap-1.5` of `inline`.
 */
const iconClasses = {
  inline: iconSlot,
  fill: `${iconSlot} me-1.5 align-middle`,
} as const;

/**
 * A page's own views: Flow / Configuration / Runs. Arrow keys move between the tabs and select
 * them, Home and End jump, and only the selected tab is in the Tab order. Switching is instant.
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
 */
export function TabList<Id extends string>({
  label,
  tabs,
  selected,
  onSelect,
  fill: fillProp,
  ids,
}: TabListProps<Id>) {
  const presentation = usePresentation();
  const fill = fillProp ?? presentation === "phone";
  const layout = fill ? "fill" : "inline";
  const tabElements = useRef(new Map<Id, HTMLButtonElement>());

  const enabled = tabs.filter((tab) => tab.disabled !== true);
  // The tab list stays reachable by Tab even when the selected id isn't one of the tabs.
  const focusable = tabs.some((tab) => tab.id === selected) ? selected : enabled[0]?.id;

  const select = (id: Id) => {
    if (id !== selected) {
      onSelect(id);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = keyTarget(event.key, enabled, focusable);
    if (next === undefined) {
      return;
    }
    event.preventDefault();
    tabElements.current.get(next)?.focus();
    select(next);
  };

  return (
    <div role="tablist" aria-label={label} className={trackClasses[layout]} onKeyDown={onKeyDown}>
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
            data-fill={isSelected ? undefined : "muted"}
            className={`${tabClasses} ${sizeClasses[layout]} ${stateClasses[state]}`}
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
            {fill ? tab.label : <InlineLabel label={tab.label} />}
            <TabSignal tab={tab} fill={fill} />
          </button>
        );
      })}
    </div>
  );
}

/** The one `tabpanel` that holds the selected view, labelled by the selected tab. */
export function TabPanel<Id extends string>({ ids, tabs, selected, children }: TabPanelProps<Id>) {
  return (
    <div
      role="tabpanel"
      id={panelElementId(ids)}
      aria-labelledby={
        tabs.some((tab) => tab.id === selected) ? tabElementId(ids, selected) : undefined
      }
    >
      {children}
    </div>
  );
}

function tabState(isSelected: boolean, isDisabled: boolean): keyof typeof stateClasses {
  if (isSelected) {
    return "selected";
  }
  return isDisabled ? "disabled" : "default";
}

/**
 * An `inline` tab is as wide as its label, and the selected label is bolder. So the label sits in
 * a one-cell grid with an invisible bold copy that sets the width, and switching tabs doesn't move
 * the tabs after it. The visible copy keeps the weight of the tab's state.
 */
function InlineLabel({ label }: { readonly label: string }) {
  return (
    <span className="inline-grid">
      <span className="col-start-1 row-start-1">{label}</span>
      <span aria-hidden="true" className={`invisible col-start-1 row-start-1 ${selectedWeight}`}>
        {label}
      </span>
    </span>
  );
}

/** What follows the label: the counter, else the running dot, else nothing. */
function TabSignal({ tab, fill }: { readonly tab: Tab; readonly fill: boolean }) {
  if (tab.count !== undefined) {
    return <TabCounter count={tab.count} fill={fill} />;
  }
  if (tab.running !== undefined) {
    return <RunningDot name={tab.running.name} fill={fill} />;
  }
  return null;
}

/**
 * The still running dot (never breathing). High contrast drops fills, so there it keeps its fill
 * in `CanvasText`. Screen readers hear its name after the tab's: "Runs, 1 running".
 */
function RunningDot({ name, fill }: { readonly name: string; readonly fill: boolean }) {
  return (
    <>
      {fill ? " " : null}
      <span
        aria-hidden="true"
        className="inline-block size-1.5 shrink-0 rounded-full bg-running align-middle forced-color-adjust-none forced-colors:bg-[CanvasText]"
      />
      <span className="sr-only">, {name}</span>
    </>
  );
}

/**
 * The counter after the label. The chip hides its number from screen readers, which hear the
 * count's name instead: "Configuration, 2 errors". On a phone a space comes first, so it wraps like
 * a word.
 */
function TabCounter({ count, fill }: { readonly count: TabCount; readonly fill: boolean }) {
  return (
    <>
      {fill ? " " : null}
      <span className="inline-flex align-middle">
        <StatusChip tone={count.tone ?? "accent"} shape="count" name={count.name}>
          {count.value}
        </StatusChip>
      </span>
    </>
  );
}

/** The tab a key moves to, skipping disabled tabs and wrapping round; none for other keys. */
function keyTarget<Id extends string>(
  key: string,
  enabled: readonly Tab<Id>[],
  current: Id | undefined,
): Id | undefined {
  if (enabled.length === 0) {
    return undefined;
  }
  // -1 when the current tab is disabled: then → goes to the first tab and ← to the last.
  const at = enabled.findIndex((tab) => tab.id === current);
  switch (key) {
    case "ArrowRight":
      return enabled[(at + 1) % enabled.length]?.id;
    case "ArrowLeft":
      return enabled[at === -1 ? enabled.length - 1 : (at - 1 + enabled.length) % enabled.length]
        ?.id;
    case "Home":
      return enabled[0]?.id;
    case "End":
      return enabled[enabled.length - 1]?.id;
    default:
      return undefined;
  }
}
