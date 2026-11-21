import { useContext, useLayoutEffect, useState } from "react";
import { OwnTooltipContext, type TooltipParts, useTooltip } from "../tooltip/tooltip.tsx";

/**
 * An unavailable Button's reason as its tooltip (`kit.button-unavailable-tooltip`, HAL-15139): the
 * first line of the text its `reason` points at, shown on hover and keyboard focus as any Tooltip
 * is. Screen readers already hear the reason through `aria-describedby`, so the tooltip is only for
 * the eye. A Tooltip round the button stays hidden while it has one.
 *
 * `popover` is `null` while the button is available or its reason has no text.
 */
export function useReasonTooltip(reason: string | undefined): TooltipParts {
  const line = useReasonLine(reason);
  const parts = useTooltip({ text: line ?? "", visualOnly: true });
  const tooltipAround = useContext(OwnTooltipContext);
  const hasOwn = line !== undefined;

  useLayoutEffect(() => {
    if (tooltipAround === null) {
      return;
    }
    tooltipAround.current = hasOwn;
    return () => {
      tooltipAround.current = false;
    };
  }, [tooltipAround, hasOwn]);

  return { ...parts, popover: hasOwn ? parts.popover : null };
}

/**
 * The reason's first line, read from the page after every render, since the text is rendered
 * elsewhere, often after the button. `undefined` while there's no reason or it has no text.
 */
function useReasonLine(reason: string | undefined): string | undefined {
  const [line, setLine] = useState<string | undefined>(undefined);
  // No dependencies on purpose: the reason's text can change while its id stays the same. React
  // skips the extra render when the line is unchanged.
  useLayoutEffect(() => {
    setLine(reason === undefined ? undefined : firstLineOf(reason));
  });
  return line;
}

/**
 * The first line of the first text a reason names, as the page shows it: "Broken flow can't run: it
 * has 1 problem." A reason can name several ids, in the order the page shows them (Run's).
 *
 * @param reason - the `reason` of `unavailable`: one id, or several separated by spaces
 */
export function firstLineOf(reason: string): string | undefined {
  const [firstId = ""] = reason.split(" ");
  const element = document.getElementById(firstId);
  if (element === null) {
    return undefined;
  }
  return firstLine(shownText(element));
}

/**
 * The text as laid out: `innerText` starts a new line at each block and leaves out what's hidden,
 * such as a busy Button's resting copy. jsdom has no `innerText`, so tests get `textContent`.
 */
function shownText(element: HTMLElement): string {
  // biome-ignore lint/performance/useDomNodeTextContent: the layout is the point: lines and what's hidden
  return typeof element.innerText === "string" ? element.innerText : (element.textContent ?? "");
}

function firstLine(text: string): string | undefined {
  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .find((line) => line !== "");
}
