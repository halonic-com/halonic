import { ListHeading } from "@halonicjs/studio-kit";
import { type FocusEvent, type KeyboardEvent, type RefObject, useId, useState } from "react";
import { listedSections, type SettingsGroup } from "./settings-groups.ts";

/** Props for {@link SettingsNav}. */
export interface SettingsNavProps {
  readonly groups: readonly SettingsGroup[];
  /** The id of the section shown on the right. */
  readonly current: string;
  /** Enter or a click on a row: show that section. */
  readonly onShow: (sectionId: string) => void;
  /** Holds the list, so the dialog can find the current row to focus. */
  readonly navRef: RefObject<HTMLElement | null>;
}

/**
 * The settings list on the left (flow-settings 3, a11y checklist 3.2): a heading per group and a
 * row per section. The list is one Tab stop. ↑ and ↓ move across both groups, Home and End go to
 * the first and last row, and none of them switch the section: Enter or a click does, and the
 * focus stays on the row. When the focus leaves the list, its Tab stop goes back to the current
 * row, so Shift Tab from the section's first control lands there.
 *
 * @example
 * <SettingsNav groups={groups} current="appearance" onShow={setCurrent} navRef={nav} />
 */
export function SettingsNav({ groups, current, onShow, navRef }: SettingsNavProps) {
  const idPrefix = useId();
  const [focused, setFocused] = useState<string | undefined>(undefined);
  const order = listedSections(groups).map((section) => section.id);
  const tabStop = focused ?? current;

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    const next = rowAfterKey(order, focused ?? current, event.key);
    if (next === undefined) {
      return;
    }
    event.preventDefault();
    setFocused(next);
    navRef.current?.querySelector<HTMLElement>(`[data-section="${next}"]`)?.focus();
  }

  function onBlur(event: FocusEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setFocused(undefined);
    }
  }

  return (
    <nav
      ref={navRef}
      aria-label="Settings sections"
      // 208px (flow-settings 3); the right column keeps the rest, at least 360px.
      className="w-52 shrink-0 overflow-y-auto border-e border-border bg-surface-subtle p-2"
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    >
      {groups.map((group) => (
        <div key={group.key}>
          <ListHeading
            id={`${idPrefix}-${group.key}`}
            name={group.name}
            {...(group.detail === undefined ? {} : { detail: group.detail })}
            headingLevel={3}
            layout="stacked"
          />
          <ul aria-labelledby={`${idPrefix}-${group.key}`} className="flex flex-col gap-0.5">
            {group.sections.map((section) => (
              <SettingsRow
                key={section.id}
                id={section.id}
                title={section.title}
                current={section.id === current}
                tabStop={section.id === tabStop}
                onFocus={() => setFocused(section.id)}
                onShow={() => onShow(section.id)}
              />
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SettingsRow(props: {
  readonly id: string;
  readonly title: string;
  readonly current: boolean;
  readonly tabStop: boolean;
  readonly onFocus: () => void;
  readonly onShow: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        data-section={props.id}
        tabIndex={props.tabStop ? 0 : -1}
        aria-current={props.current ? "page" : undefined}
        className={props.current ? rowClasses.current : rowClasses.other}
        onFocus={props.onFocus}
        onClick={props.onShow}
      >
        <span className="min-w-0 flex-1 wrap-break-word">{props.title}</span>
      </button>
    </li>
  );
}

/** The row ↑, ↓, Home or End moves to from `from`, or `undefined` for any other key. */
export function rowAfterKey(
  order: readonly string[],
  from: string,
  key: string,
): string | undefined {
  const index = order.indexOf(from);
  switch (key) {
    case "ArrowDown":
      return order[Math.min(index + 1, order.length - 1)];
    case "ArrowUp":
      return order[Math.max(index - 1, 0)];
    case "Home":
      return order[0];
    case "End":
      return order.at(-1);
    default:
      return undefined;
  }
}

// The sidebar's 32px row (component specs 24.4); a name too long for one line wraps, never cut
// (a11y checklist 3.21), so the row grows rather than holding 32px.
const rowBase =
  "flex min-h-control-md w-full min-w-0 items-center gap-2 rounded-sm px-2 py-1 text-start text-body focus-ring-inset";

const rowClasses = {
  // In forced colours the tint is gone, so a 2px `Highlight` bar at the start marks the current row.
  current: [
    rowBase,
    "bg-halo-tint font-medium text-fg",
    "forced-colors:border-s-2 forced-colors:border-[Highlight]",
  ].join(" "),
  other: [rowBase, "text-fg-muted hover:bg-surface-muted hover:text-fg"].join(" "),
} as const;
