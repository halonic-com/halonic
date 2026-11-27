import {
  createContext,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefCallback,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useRef,
} from "react";
import { InTooltipContext, Kbd, keyShortcutsLabel } from "../kbd/kbd.tsx";
import { placePopover, placePopoverBeside } from "../popover/place-popover.ts";

/** How long the pointer rests on the control before its tooltip shows. */
export const TOOLTIP_DELAY_MS = 500;

/** What the tooltip's `children` spread on their control: a kit `Button` takes both. */
export interface TooltipTriggerProps {
  /** Left out when the tooltip's text is the control's name (`isName`). */
  readonly "aria-describedby"?: string;
  readonly "aria-keyshortcuts"?: string;
}

/** What a tooltip says and when, for `Tooltip` and `useTooltip`. */
export interface TooltipOptions {
  /** A few words, never anything you click: "New tab", "Finish getting updates first." */
  readonly text: string;
  /** The control's shortcut, shown after the words: `["Ctrl", "T"]`. */
  readonly keys?: readonly string[];
  /**
   * The text is the control's name, as on an icon button whose `label` is "New tab". The control
   * then isn't described by it too, which a screen reader would read twice.
   */
  readonly isName?: boolean;
  /**
   * Screen readers already hear the text another way, as an unavailable Button's reason, which
   * describes it through `aria-describedby`. The control then isn't described by the tooltip, and
   * screen readers skip the tooltip, so nothing is read twice.
   */
  readonly visualOnly?: boolean;
  /**
   * Asked each time the tooltip would show; it stays hidden when this says no. For a tooltip that
   * only helps sometimes, such as the full title of a title that may be cut with "…".
   */
  readonly showIf?: () => boolean;
  /**
   * `beside` puts it after the control, centred on it top to bottom, for a control in a column
   * whose neighbours a tooltip below would cover, as the rail's buttons. Below by default.
   */
  readonly side?: "below" | "beside";
}

/** The props of `Tooltip`. */
export interface TooltipProps extends TooltipOptions {
  /** The control, given the props that link it to the tooltip. */
  readonly children: (props: TooltipTriggerProps) => ReactNode;
}

/**
 * What `useTooltip` gives the element the tooltip belongs to: the ref it's placed by, and the
 * pointer, focus and key handlers that show and hide it. A handler the element has of its own
 * must call the matching one here too.
 */
export interface TooltipAnchorProps {
  readonly ref: RefCallback<HTMLElement>;
  readonly onPointerEnter: (event: PointerEvent) => void;
  readonly onPointerDown: () => void;
  readonly onPointerLeave: () => void;
  readonly onFocus: (event: FocusEvent) => void;
  readonly onBlur: () => void;
  readonly onKeyDown: (event: KeyboardEvent) => void;
}

/** The parts of a tooltip, from `useTooltip`. */
export interface TooltipParts {
  /** For the element the tooltip is placed under and that hears the pointer, focus and keys. */
  readonly anchor: TooltipAnchorProps;
  /** For the control the tooltip names or describes; often the same element as `anchor`. */
  readonly trigger: TooltipTriggerProps;
  /** The tooltip itself, rendered anywhere beside its control. */
  readonly popover: ReactNode;
}

/**
 * Set by a `Tooltip` round its control. A control with a tooltip of its own, as an unavailable
 * Button has for its reason, sets it to `true` while it has one, and the Tooltip round it then
 * stays hidden: one tooltip at a time, and the reason wins (HAL-15253).
 */
export const OwnTooltipContext = createContext<RefObject<boolean> | null>(null);

/** The tooltip sits this far below (or above) its control. */
const CONTROL_GAP = 4;

/**
 * Inverted: a solid `fg` fill with `surface` text, so it turns light in dark mode. The see-through
 * edge keeps its shape in high contrast, which drops the fill. It never takes the pointer.
 */
export const tooltipClasses = [
  "pointer-events-none m-0 inset-auto max-w-60 rounded-sm border border-transparent px-2 py-1",
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
 * a tooltip. Where a wrapper would break the layout round the control, as in a row of tabs, use
 * `useTooltip` on the control itself.
 *
 * @example
 * <Tooltip text="New tab" keys={["Ctrl", "T"]} isName>
 *   {(props) => <Button {...props} variant="ghost" icon={<PlusIcon />} label="New tab" />}
 * </Tooltip>
 */
export function Tooltip({ children, showIf, ...options }: TooltipProps) {
  const controlHasOwn = useRef(false);
  const { anchor, trigger, popover } = useTooltip({
    ...options,
    showIf: () => !controlHasOwn.current && (showIf === undefined || showIf()),
  });
  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: it only hears its control's pointer, focus and keys; the control is what you use */}
      <span className="inline-flex" {...anchor}>
        <OwnTooltipContext value={controlHasOwn}>{children(trigger)}</OwnTooltipContext>
      </span>
      {popover}
    </>
  );
}

/**
 * The tooltip of `Tooltip`, without the wrapper: spread `anchor` and `trigger` on the control and
 * render `popover` beside it. It behaves exactly as `Tooltip` does.
 *
 * @example
 * const { anchor, trigger, popover } = useTooltip({ text: "Workflows / Support reply" });
 * return <><div role="tab" {...anchor} {...trigger}>Support reply</div>{popover}</>;
 */
export function useTooltip({
  text,
  keys,
  isName = false,
  visualOnly = false,
  showIf,
  side = "below",
}: TooltipOptions): TooltipParts {
  const id = useId();
  const anchor = useRef<HTMLElement | null>(null);
  const tooltip = useRef<HTMLDivElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const shown = useRef(false);
  /** The control was pressed and the pointer hasn't left it since (component specs 14, C27). */
  const pressed = useRef(false);
  const setAnchor = useCallback((element: HTMLElement | null) => {
    anchor.current = element;
  }, []);
  const setTooltip = useCallback((element: HTMLDivElement | null) => {
    tooltip.current = element;
    // A tooltip taken away while shown goes with it, so the next one can show.
    if (element === null) {
      shown.current = false;
    }
  }, []);

  function show(): void {
    const element = tooltip.current;
    if (element === null || anchor.current === null || shown.current || pressed.current) {
      return;
    }
    if (showIf !== undefined && !showIf()) {
      return;
    }
    // A page with no Popover API, such as jsdom in a test without the fake, shows no tooltip
    // rather than throwing from a focus or pointer handler (HAL-15559).
    if (typeof element.showPopover !== "function") {
      return;
    }
    element.showPopover();
    shown.current = true;
    if (side === "beside") {
      placePopoverBeside(element, anchor.current, CONTROL_GAP);
    } else {
      placePopover(element, anchor.current, { gap: CONTROL_GAP, align: "center" });
    }
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

  const anchorProps: TooltipAnchorProps = {
    ref: setAnchor,
    onPointerEnter(event) {
      if (event.pointerType === "touch") {
        return;
      }
      clearTimeout(timer.current);
      timer.current = setTimeout(show, TOOLTIP_DELAY_MS);
    },
    onPointerDown() {
      hide();
      pressed.current = true;
    },
    onPointerLeave() {
      hide();
      pressed.current = false;
    },
    onFocus(event) {
      // Keyboard focus only: a click or a tap focuses the control too, without the ring.
      if (event.target.matches(":focus-visible")) {
        show();
      }
    },
    onBlur: hide,
    onKeyDown(event) {
      // Escape closes the topmost thing, and only that (specs 23 A7): the tooltip, not a dialog.
      if (event.key === "Escape" && shown.current) {
        event.preventDefault();
        event.stopPropagation();
        hide();
      }
    },
  };

  return {
    anchor: anchorProps,
    trigger: {
      ...(isName || visualOnly ? {} : { "aria-describedby": id }),
      ...(keys === undefined ? {} : { "aria-keyshortcuts": keyShortcutsLabel(keys) }),
    },
    popover: (
      <div
        id={id}
        ref={setTooltip}
        popover="manual"
        role="tooltip"
        aria-hidden={visualOnly || undefined}
        className={tooltipClasses}
      >
        <TooltipBody text={text} keys={keys} />
      </div>
    ),
  };
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
