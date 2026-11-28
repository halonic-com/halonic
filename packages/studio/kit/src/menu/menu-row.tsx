import { useId } from "react";
import { TickIcon } from "../icons/tick-icon.tsx";
import { Kbd } from "../kbd/kbd.tsx";
import { MiddleCut } from "../middle-cut/middle-cut.tsx";
import { StatusChip } from "../status-chip/status-chip.tsx";
import { type MenuItem, taggedItemName } from "./menu.tsx";

/**
 * 32px on desktop, 48px on a phone and under a coarse pointer (component specs 14, 23.5). The
 * active item is the focused one, and its fill is the only sign: no ring. In high contrast,
 * which drops the fill, the see-through outline shows instead; under more contrast it shows as an
 * edge as well.
 */
const rowClasses = [
  "flex w-full min-h-control-md items-center gap-2 rounded-md px-3 text-left text-body",
  "outline-2 -outline-offset-2 outline-transparent focus:outline-solid",
  "contrast-more:focus:outline-border-control",
  "phone:min-h-touch touch:min-h-touch",
].join(" ");

const toneClasses = {
  default: "text-fg focus:bg-surface-muted",
  danger: "text-danger focus:bg-surface-muted",
  disabled: "cursor-not-allowed text-fg-disabled text-forced-disabled",
  // Grows to two lines: about 48px on desktop, 64px on a phone and under a coarse pointer.
  unavailable: "cursor-not-allowed py-1.5 text-fg focus:bg-surface-muted phone:py-3 touch:py-3",
} as const;

// An item with a detail line grows to two lines the same way.
const twoLineClasses = "py-1.5 phone:py-3 touch:py-3";

const iconSlot =
  "inline-grid size-icon-sm shrink-0 place-items-center *:size-full phone:size-icon-md touch:size-icon-md";

// The leading icon draws 18px in a 20px box (COMPONENTS.md, Menu), in `fg-muted` unless the item
// is danger or disabled, whose colour it takes from the row.
const leadingIconSlot =
  "inline-grid size-icon-md shrink-0 place-items-center *:size-4.5 phone:*:size-full touch:*:size-full";
const leadingIconTone = {
  default: "text-fg-muted",
  danger: "",
  disabled: "",
  unavailable: "text-fg-muted",
} as const;

/** Only the label and the icon fade on an unavailable item; its reason stays at full strength. */
const fadedWhileUnavailable = "opacity-45 contrast-more:opacity-60 forced-colors:opacity-100";

interface MenuRowProps {
  readonly item: MenuItem;
  readonly active: boolean;
  readonly keyShortcuts: string | undefined;
  readonly onFocus: () => void;
  readonly onBlur: () => void;
  readonly onPick: () => void;
}

/**
 * One item of a Menu: a `menuitem` button that the Menu moves focus to, or a `menuitemradio`
 * when the item has `checked`.
 */
export function MenuRow({ item, active, keyShortcuts, onFocus, onBlur, onPick }: MenuRowProps) {
  const reasonId = useId();
  const detailId = useId();
  const disabled = item.disabled === true;
  const unavailable = item.unavailable !== undefined;
  const tone = rowTone(item);
  const faded = unavailable ? fadedWhileUnavailable : "";

  return (
    <button
      type="button"
      {...roleOf(item)}
      tabIndex={-1}
      // A tagged item's name carries its attention words too, which the label replaces.
      aria-label={item.name ?? taggedItemName(item, item.attention)}
      aria-disabled={disabled || unavailable ? true : undefined}
      aria-describedby={describedBy([
        item.detail === undefined ? undefined : detailId,
        unavailable ? reasonId : undefined,
      ])}
      aria-keyshortcuts={keyShortcuts}
      // The Kbd on the active item's muted fill steps up to the border fill (specs 10, 14).
      data-fill={active ? "muted" : undefined}
      className={`${rowClasses} ${toneClasses[tone]} ${item.detail === undefined || unavailable ? "" : twoLineClasses}`.trim()}
      onClick={onPick}
      onFocus={onFocus}
      onBlur={onBlur}
      // The pointer and the keyboard share one active item: the one under the pointer. Over a
      // disabled item the menu itself takes focus, so no other item keeps the fill (specs 14, C24).
      onPointerMove={(event) => {
        const target = disabled
          ? event.currentTarget.closest<HTMLElement>("[role=menu]")
          : event.currentTarget;
        if (target !== null && document.activeElement !== target) {
          target.focus();
        }
      }}
    >
      {item.icon === undefined ? null : (
        <span
          className={`${leadingIconSlot} ${leadingIconTone[tone]} ${faded}`.trim()}
          aria-hidden="true"
        >
          {item.icon}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={faded}>{item.label}</span>
        {item.detail === undefined ? null : (
          <ItemDetail id={detailId} item={item} detail={item.detail} faded={faded} />
        )}
        {unavailable ? (
          <span id={reasonId} className="text-small text-fg-muted">
            {item.unavailable?.reason}
          </span>
        ) : null}
      </span>
      <ItemFacts item={item} />
      {item.keys === undefined ? null : (
        <span className="ml-auto pl-4">
          <Kbd keys={item.keys} />
        </span>
      )}
      {item.checked === true ? (
        <span className={`${iconSlot} ml-auto text-accent ${faded}`.trim()} aria-hidden="true">
          <TickIcon />
        </span>
      ) : null}
    </button>
  );
}

/** What follows the label: the time, the tag, the count, and the attention or running dot. */
function ItemFacts({ item }: { readonly item: MenuItem }) {
  return (
    <>
      {item.time === undefined ? null : (
        <span aria-hidden="true" className="shrink-0 text-caption text-fg-subtle tabular-nums">
          {item.time}
        </span>
      )}
      {item.tag === undefined ? null : <ItemTag words={item.tag} />}
      {item.count === undefined ? null : <ItemTag words={item.count} tone="neutral" />}
      {item.attention === undefined ? null : <ItemDot words={item.attention} tone="warning" />}
      {item.running === undefined ? null : <ItemDot words={item.running} tone="running" />}
    </>
  );
}

/**
 * The line under the label, out of the item's name, which stays the label: a screen reader reads
 * it as its description. It ends in "…", or is cut in the middle or wraps when the item says so.
 */
function ItemDetail({
  id,
  item,
  detail,
  faded,
}: {
  readonly id: string;
  readonly item: MenuItem;
  readonly detail: string;
  readonly faded: string;
}) {
  if (item.detailCut === "middle") {
    return (
      <span id={id} aria-hidden="true" className={faded || undefined}>
        <MiddleCut text={detail} />
      </span>
    );
  }
  // Wrapped, at most 300px wide like the menu's description (component specs 20.2).
  const fit = item.detailCut === "wrap" ? "max-w-75" : "truncate";
  return (
    <span
      id={id}
      aria-hidden="true"
      className={`${fit} text-caption text-fg-subtle ${faded}`.trim()}
    >
      {detail}
    </span>
  );
}

const dotClasses = { warning: "bg-warning", running: "bg-running" } as const;

/**
 * The still 6px `warning` or `running` dot, kept in its colour in forced colours, and its words
 * for a screen reader, so the item doesn't rely on colour alone.
 */
function ItemDot({
  words,
  tone,
}: {
  readonly words: string;
  readonly tone: keyof typeof dotClasses;
}) {
  return (
    <span className="inline-grid size-icon-sm shrink-0 place-items-center">
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${dotClasses[tone]} forced-color-adjust-none`}
      />
      <span className="sr-only">, {words}</span>
    </span>
  );
}

/**
 * The outline tag after the label, or the `neutral` count chip. A screen reader hears a tag's
 * words in the item's `aria-label`, and a count's in its `name`.
 */
function ItemTag({
  words,
  tone = "outline",
}: {
  readonly words: string;
  readonly tone?: "outline" | "neutral";
}) {
  return (
    <span aria-hidden="true" className="inline-flex shrink-0">
      <StatusChip tone={tone}>{words}</StatusChip>
    </span>
  );
}

/** The ids the item is described by, or none. */
function describedBy(ids: readonly (string | undefined)[]): string | undefined {
  const present = ids.filter((id) => id !== undefined);
  return present.length === 0 ? undefined : present.join(" ");
}

/** A plain item, or one choice of several with its state. */
function roleOf(item: MenuItem) {
  return item.checked === undefined
    ? ({ role: "menuitem" } as const)
    : ({ role: "menuitemradio", "aria-checked": item.checked } as const);
}

function rowTone(item: MenuItem): keyof typeof toneClasses {
  if (item.disabled === true) {
    return "disabled";
  }
  if (item.unavailable !== undefined) {
    return "unavailable";
  }
  return item.danger === true ? "danger" : "default";
}
