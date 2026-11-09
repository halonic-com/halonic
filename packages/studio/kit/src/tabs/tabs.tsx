import { type KeyboardEvent, type ReactNode, useId, useRef } from "react";
import { usePresentation } from "../presentation/presentation.tsx";
import { StatusChip } from "../status-chip/status-chip.tsx";

/** The counter on a tab: how many things its view holds, or how many errors it has. */
export interface TabCount {
  readonly value: number;
  /** `danger` when it counts errors. The tab itself never turns red. */
  readonly tone?: "accent" | "danger";
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
  /** Can't be opened now. It's still shown, but clicks and the arrow keys skip it. */
  readonly disabled?: boolean;
}

export interface TabsProps<Id extends string = string> {
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
  /** The tabs stay at the top of the scroll area while the page scrolls under them. */
  readonly sticky?: boolean;
  /** The selected tab's view. */
  readonly children: ReactNode;
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

const stateClasses = {
  // selected-forced is the selected tab's edge in high contrast, which drops the fill and the
  // shadow (component specs 23 A11, 23.5). The focus ring's own outline wins on focus.
  selected: "bg-surface font-medium text-fg shadow-1 selected-forced",
  default: "text-fg-muted hover:text-fg",
  disabled: "cursor-not-allowed text-fg-disabled text-forced-disabled",
} as const;

const iconSlot = "inline-grid size-icon-sm shrink-0 place-items-center *:size-full";

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
export function Tabs<Id extends string>({
  label,
  tabs,
  selected,
  onSelect,
  fill: fillProp,
  sticky = false,
  children,
}: TabsProps<Id>) {
  const presentation = usePresentation();
  const fill = fillProp ?? presentation === "phone";
  const layout = fill ? "fill" : "inline";
  const baseId = useId();
  const tabElements = useRef(new Map<Id, HTMLButtonElement>());

  const tabId = (id: Id) => `${baseId}-tab-${id}`;
  const panelId = `${baseId}-panel`;
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

  const list = (
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
            id={tabId(tab.id)}
            aria-selected={isSelected}
            aria-controls={isSelected ? panelId : undefined}
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
              <span className={iconSlot} aria-hidden="true">
                {tab.icon}
              </span>
            )}
            {tab.label}
            {tab.count === undefined ? null : <TabCounter count={tab.count} fill={fill} />}
          </button>
        );
      })}
    </div>
  );

  return (
    <div>
      {sticky ? <div className={stickyClasses}>{list}</div> : list}
      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={tabs.some((tab) => tab.id === selected) ? tabId(selected) : undefined}
      >
        {children}
      </div>
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
 * The counter after the label. Its number is hidden from screen readers, which hear the count's
 * name instead: "Configuration, 2 errors". On a phone a space comes first, so it wraps like a word.
 */
function TabCounter({ count, fill }: { readonly count: TabCount; readonly fill: boolean }) {
  return (
    <>
      {fill ? " " : null}
      <span aria-hidden="true" className="inline-flex align-middle">
        <StatusChip tone={count.tone ?? "accent"} shape="count">
          {count.value}
        </StatusChip>
      </span>
      <span className="sr-only">, {count.name}</span>
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
