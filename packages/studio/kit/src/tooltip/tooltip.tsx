import {
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from "react";
import { InTooltipContext, Kbd, keyShortcutsLabel } from "../kbd/kbd.tsx";
import { placePopover } from "../popover/place-popover.ts";

/** How long the pointer rests on the control before its tooltip shows. */
export const TOOLTIP_DELAY_MS = 500;

/** What the tooltip's `children` spread on their control: a kit `Button` takes both. */
export interface TooltipTriggerProps {
  /** Left out when the tooltip's text is the control's name (`isName`). */
  readonly "aria-describedby"?: string;
  readonly "aria-keyshortcuts"?: string;
}

export interface TooltipProps {
  /** A few words, never anything you click: "New tab", "Finish getting updates first." */
  readonly text: string;
  /** The control's shortcut, shown after the words: `["Ctrl", "T"]`. */
  readonly keys?: readonly string[];
  /**
   * The text is the control's name, as on an icon button whose `label` is "New tab". The control
   * then isn't described by it too, which a screen reader would read twice.
   */
  readonly isName?: boolean;
  /** The control, given the props that link it to the tooltip. */
  readonly children: (props: TooltipTriggerProps) => ReactNode;
}

/** The tooltip sits this far below (or above) its control. */
const CONTROL_GAP = 4;

/**
 * Inverted: a solid `fg` fill with `surface` text, so it turns light in dark mode. The see-through
 * edge keeps its shape in high contrast, which drops the fill. It never takes the pointer.
 */
export const tooltipClasses = [
  "pointer-events-none m-0 inset-auto max-w-60 rounded-xs border border-transparent px-2 py-1",
  "bg-inverse text-caption text-surface",
  "transition-opacity duration-(--duration-fast) ease-enter starting:opacity-0",
].join(" ");

/**
 * A short label for a control, shown after 500ms of hover or at once on keyboard focus, and hidden
 * on leave, a press, blur or Escape. After a press it waits until the pointer has left and come
 * back. A `popover="manual"` centred under the control by the kit's positioning helper, linked with
 * `aria-describedby` unless its text is the control's name. Not native `title`: that can't be styled, doesn't show on keyboard
 * focus and many screen readers skip it.
 *
 * Never on touch: a tap doesn't show it, so what it says must be reachable another way (component
 * specs 0.2). An external keyboard's focus still shows it.
 *
 * The control is wrapped, so a control that gets no pointer or focus events of its own still gets
 * a tooltip.
 *
 * @example
 * <Tooltip text="New tab" keys={["Ctrl", "T"]} isName>
 *   {(props) => <Button {...props} variant="ghost" icon={<PlusIcon />} label="New tab" />}
 * </Tooltip>
 */
export function Tooltip({ text, keys, isName = false, children }: TooltipProps) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const shown = useRef(false);
  /** The control was pressed and the pointer hasn't left it since (component specs 14, C27). */
  const pressed = useRef(false);

  function show(): void {
    const element = tooltip.current;
    if (element === null || anchor.current === null || shown.current || pressed.current) {
      return;
    }
    element.showPopover();
    shown.current = true;
    placePopover(element, anchor.current, { gap: CONTROL_GAP, align: "center" });
  }

  function hide(): void {
    clearTimeout(timer.current);
    if (tooltip.current !== null && shown.current) {
      tooltip.current.hidePopover();
      shown.current = false;
    }
  }

  // Don't leave a timer behind, or a tooltip open on a control that's gone.
  useEffect(() => () => clearTimeout(timer.current), []);

  function onPointerEnter(event: PointerEvent): void {
    if (event.pointerType === "touch") {
      return;
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(show, TOOLTIP_DELAY_MS);
  }

  function onPointerDown(): void {
    hide();
    pressed.current = true;
  }

  function onPointerLeave(): void {
    hide();
    pressed.current = false;
  }

  function onFocus(event: FocusEvent): void {
    // Keyboard focus only: a click or a tap focuses the control too, without the ring.
    if (event.target.matches(":focus-visible")) {
      show();
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    // Escape closes the topmost thing, and only that (specs 23 A7): the tooltip, not a dialog.
    if (event.key === "Escape" && shown.current) {
      event.preventDefault();
      event.stopPropagation();
      hide();
    }
  }

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: it only hears its control's pointer, focus and keys; the control is what you use */}
      <span
        ref={anchor}
        className="inline-flex"
        onPointerEnter={onPointerEnter}
        onPointerDown={onPointerDown}
        onPointerLeave={onPointerLeave}
        onFocus={onFocus}
        onBlur={hide}
        onKeyDown={onKeyDown}
      >
        {children({
          ...(isName ? {} : { "aria-describedby": id }),
          ...(keys === undefined ? {} : { "aria-keyshortcuts": keyShortcutsLabel(keys) }),
        })}
      </span>
      <div id={id} ref={tooltip} popover="manual" role="tooltip" className={tooltipClasses}>
        <TooltipBody text={text} keys={keys} />
      </div>
    </>
  );
}

/**
 * What a tooltip says: its text, then its keys 8px after it, without the Kbd's box (component
 * specs 14, C13). Also drawn by the states page's static copy.
 */
export function TooltipBody({
  text,
  keys,
}: {
  readonly text: string;
  readonly keys: readonly string[] | undefined;
}) {
  return (
    <>
      {text}
      {keys === undefined ? null : (
        <InTooltipContext value={true}>
          <span className="ml-2">
            <Kbd keys={keys} />
          </span>
        </InTooltipContext>
      )}
    </>
  );
}
