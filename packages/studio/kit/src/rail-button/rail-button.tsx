import type { MouseEvent, ReactNode } from "react";
import { useTooltip } from "../tooltip/tooltip.tsx";

/** The counter at a rail button: how many things wait in its app. */
export interface RailButtonCount {
  readonly value: number;
  /** What the number means, read after the button's name: "2 unread" makes "Messenger, 2 unread". */
  readonly name: string;
}

/** The props of `RailButton`. */
export interface RailButtonProps {
  /** The app's name: the button's accessible name and its tooltip. */
  readonly label: string;
  /**
   * The app's 24px drawing: the resting line while not selected, the selected drawing (glass,
   * line of light) while selected. The rail's one point of light is drawn by the rail, not here.
   */
  readonly icon: (selected: boolean) => ReactNode;
  readonly selected: boolean;
  readonly onSelect: () => void;
  /** Shown only while its value is above 0. */
  readonly count?: RailButtonCount;
  /**
   * Makes the button a link to this address, so a screen reader lists it with the page's links.
   * The button never follows it: a click still calls `onSelect`.
   */
  readonly href?: string;
}

/**
 * The circle round the drawing: none at rest, `surface-muted` under the pointer, pressed and
 * selected (the new design's highlight, HAL-20672). In forced colours the fill is gone, so the selected
 * one gets a 2px `Highlight` edge.
 */
const circle = [
  "group/rail-button relative grid size-10 shrink-0 place-items-center rounded-full focus-ring transition-colors",
  "hover:bg-surface-muted active:bg-surface-muted aria-[current=page]:bg-surface-muted",
  "forced-colors:aria-[current=page]:border-2 forced-colors:aria-[current=page]:border-[Highlight]",
].join(" ");

/**
 * The drawing eases between sizes, so it settles back to 100% when the button is picked rather
 * than jumping (Julian, HAL-20675).
 */
const drawingTransition = "transition-transform duration-(--duration-rail-hover) ease-press";

/**
 * The drawing grows to 110% under the pointer in 180ms and shrinks to 90% when pressed in 60ms:
 * the one place the kit scales something (decision HAL-20675). Never while the person prefers
 * reduced motion, and never on the selected button, which doesn't react. The group is named, so a
 * group round the button in a screen can't scale it.
 */
const scaling = [
  "motion-safe:group-hover/rail-button:scale-110 motion-safe:group-active/rail-button:scale-90",
  "group-active/rail-button:duration-(--duration-rail-press)",
].join(" ");

/**
 * One app in the icon rail on the window's left edge (build plan P2 on HAL-20617): its 24px drawing
 * in a 40px circle, the name as a tooltip beside it, and a count badge at the circle's top end.
 * The selected button is `aria-current="page"` with the circle filled and the selected drawing.
 * The rail lays the buttons out and draws the travelling point of light; this is one button.
 *
 * @example
 * <RailButton label="Messenger" icon={(selected) => <MessengerIcon selected={selected} />}
 *   selected={app === "messenger"} onSelect={() => open("messenger")} />
 */
export function RailButton({ label, icon, selected, onSelect, count, href }: RailButtonProps) {
  const { anchor, trigger, popover } = useTooltip({ text: label, isName: true, side: "beside" });
  const shownCount = count !== undefined && count.value > 0 ? count : undefined;
  const select = (event: MouseEvent) => {
    event.preventDefault();
    onSelect();
  };
  const target = {
    ...anchor,
    ...trigger,
    "aria-current": selected ? ("page" as const) : undefined,
    // The badge is drawn as a mark, so the name says it: "Messenger, 2 unread".
    "aria-label": shownCount === undefined ? label : `${label}, ${shownCount.name}`,
    className: circle,
    onClick: select,
  };
  const content = (
    <>
      <span
        className={`grid size-6 place-items-center *:size-full ${drawingTransition}${selected ? "" : ` ${scaling}`}`}
      >
        {icon(selected)}
      </span>
      {shownCount === undefined ? null : <CountBadge value={shownCount.value} />}
    </>
  );
  return (
    <>
      {href === undefined ? (
        <button type="button" {...target}>
          {content}
        </button>
      ) : (
        <a href={href} {...target}>
          {content}
        </a>
      )}
      {popover}
    </>
  );
}

/** Past this the badge shows "99+", as the Messenger's rows do (`kit.rail-button-count-cap`). */
const maxShownCount = 99;

/**
 * The 20px badge, 3px above and 5px beyond the circle's top end, with a 2px ring in the
 * rail's colour (`canvas`). The button's name already says it, so it's hidden here.
 */
function CountBadge({ value }: { readonly value: number }) {
  return (
    <span
      aria-hidden="true"
      className="absolute -end-1.25 -top-0.75 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-caption text-on-primary tabular-nums ring-2 ring-canvas"
    >
      {value > maxShownCount ? `${maxShownCount}+` : value}
    </span>
  );
}
