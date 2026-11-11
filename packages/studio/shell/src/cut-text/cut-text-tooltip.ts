import { type TooltipAnchorProps, useTooltip } from "@halonicjs/studio-kit";
import { type ReactNode, useCallback, useRef } from "react";

/** The parts of a cut text's tooltip, from {@link useCutTextTooltip}. */
export interface CutTextTooltip {
  /** Spread on the element that shortens its text with "…"; it's measured and placed by. */
  readonly anchor: TooltipAnchorProps;
  /** The tooltip, rendered beside the element. */
  readonly popover: ReactNode;
}

/**
 * The full text of a title that may be cut with "…", as a kit tooltip (`shell.cut-text-tooltips`):
 * on hover or keyboard focus it shows only while the text is cut. It never names or describes the
 * element, since the element's own text is already the full text and a screen reader reads that.
 *
 * @example
 * const { anchor, popover } = useCutTextTooltip(location.title);
 * return <><span className="truncate" {...anchor}>{location.title}</span>{popover}</>;
 */
export function useCutTextTooltip(text: string): CutTextTooltip {
  const element = useRef<HTMLElement | null>(null);
  const { anchor, popover } = useTooltip({
    text,
    isName: true,
    showIf: () => element.current !== null && isCut(element.current),
  });
  const placeBy = anchor.ref;
  const ref = useCallback(
    (node: HTMLElement | null) => {
      element.current = node;
      placeBy(node);
    },
    [placeBy],
  );
  return { anchor: { ...anchor, ref }, popover };
}

/** Whether an element shows less than its text: one line cut with "…", or a field scrolled. */
export function isCut(element: HTMLElement): boolean {
  return element.scrollWidth > element.clientWidth;
}
