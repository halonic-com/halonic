import { useId } from "react";
import { TickIcon } from "../icons/tick-icon.tsx";
import { Kbd } from "../kbd/kbd.tsx";
import type { MenuItem } from "./menu.tsx";

/**
 * 32px on desktop, 48px on a phone and under a coarse pointer (component specs 14, 23.5). The
 * active item is the focused one, and its fill is the only sign: no ring. In high contrast,
 * which drops the fill, the see-through outline shows instead; under more contrast it shows as an
 * edge as well.
 */
const rowClasses = [
  "flex w-full min-h-control-md items-center gap-2 rounded-sm px-2 text-left text-body",
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

const iconSlot =
  "inline-grid size-icon-sm shrink-0 place-items-center *:size-full phone:size-icon-md touch:size-icon-md";

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
  const disabled = item.disabled === true;
  const unavailable = item.unavailable !== undefined;
  const tone = rowTone(item);
  const faded = unavailable ? fadedWhileUnavailable : "";

  return (
    <button
      type="button"
      {...roleOf(item)}
      tabIndex={-1}
      aria-disabled={disabled || unavailable ? true : undefined}
      aria-describedby={unavailable ? reasonId : undefined}
      aria-keyshortcuts={keyShortcuts}
      // The Kbd on the active item's muted fill steps up to the border fill (specs 10, 14).
      data-fill={active ? "muted" : undefined}
      className={`${rowClasses} ${toneClasses[tone]}`}
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
        <span className={`${iconSlot} ${faded}`.trim()} aria-hidden="true">
          {item.icon}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={faded}>{item.label}</span>
        {unavailable ? (
          <span id={reasonId} className="text-small text-fg-muted">
            {item.unavailable?.reason}
          </span>
        ) : null}
      </span>
      {item.attention === undefined ? null : <AttentionDot words={item.attention} />}
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

/**
 * The still 6px `warning` dot, kept in its colour in forced colours, and its words for a screen
 * reader, so the item doesn't rely on colour alone.
 */
function AttentionDot({ words }: { readonly words: string }) {
  return (
    <span className="inline-grid size-icon-sm shrink-0 place-items-center">
      <span
        aria-hidden="true"
        className="size-1.5 rounded-full bg-warning forced-color-adjust-none"
      />
      <span className="sr-only">, {words}</span>
    </span>
  );
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
