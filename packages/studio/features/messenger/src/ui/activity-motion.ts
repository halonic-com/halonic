import { reportMotion } from "./load-states.tsx";

/**
 * The medium window's sheet arriving (HAL-18558 section 4): it fades in and comes `--motion-rise`
 * from the window's end, over `--duration-base` with `--ease-enter`. The kit's `enter` only rises
 * upwards, and the sheet arrives sideways, so this reads the same tokens. Under reduced motion only
 * a `--duration-fast` fade. jsdom has no `element.animate`, so there it only shows.
 */
export function arriveFromEnd(element: HTMLElement): void {
  if (typeof element.animate !== "function") return;
  const style = getComputedStyle(element);
  const read = (name: string) => style.getPropertyValue(name).trim();
  const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  const rise = reduced ? 0 : pixels(read("--motion-rise"));
  const fromEnd = style.direction === "rtl" ? -rise : rise;
  element
    .animate(
      [
        { opacity: 0, transform: `translateX(${fromEnd}px)` },
        { opacity: 1, transform: "translateX(0)" },
      ],
      {
        duration: milliseconds(read(reduced ? "--duration-fast" : "--duration-base")),
        easing: read("--ease-enter") || "ease",
      },
    )
    .finished.catch(reportMotion);
}

/** "200ms" or "0.2s" in milliseconds; a missing token reads as 0, so nothing waits. */
function milliseconds(value: string): number {
  const amount = Number.parseFloat(value);
  if (Number.isNaN(amount)) return 0;
  return value.endsWith("ms") ? amount : amount * 1000;
}

/** "8px" as 8; a missing token reads as 0, so nothing moves. */
function pixels(value: string): number {
  const amount = Number.parseFloat(value);
  return Number.isNaN(amount) ? 0 : amount;
}
