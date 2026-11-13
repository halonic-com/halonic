import { useId } from "react";
import { useNarrowWindow } from "../frame/frame-effects.ts";

/**
 * The Halonic mark and the words "Halonic Studio" at the far left of the title bar (design
 * decision HAL-8416). It is not a link and not a button. Under 900px the words go and the mark
 * stays, so the tabs keep their room; the mark then carries the name "Halonic Studio".
 *
 * @example
 * <ShellFrame titleBar={<><TitleBarBrand /><HistoryButtons tabs={workspace.tabs} /></>} …>
 */
export function TitleBarBrand() {
  const narrow = useNarrowWindow();
  return (
    <div className="flex shrink-0 items-center gap-2 pe-1 ps-1">
      <HalonicMark named={narrow} />
      {narrow ? null : <span className="text-small font-semibold text-fg">Halonic Studio</span>}
    </div>
  );
}

/**
 * The ring alone, 20px, drawn as on halonic.dev (`brand/masters/halonic-mark.svg`): the band is 16%
 * of the diameter in one viewBox, so no pixel stroke, and the one gradient runs bottom left to top
 * right (design decisions 42, 91, 92). The ring has no glow, so it looks the same in light and
 * dark and needs no media query. The Android connect page draws the same ring.
 */
function HalonicMark({ named }: { readonly named: boolean }) {
  const gradientId = useId();
  return (
    <svg
      viewBox="0 0 100 100"
      className="size-icon-md shrink-0"
      role={named ? "img" : undefined}
      aria-label={named ? "Halonic Studio" : undefined}
      aria-hidden={named ? undefined : true}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#3175f2" />
          <stop offset="1" stopColor="#1bc6c8" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="42" fill="none" stroke={`url(#${gradientId})`} strokeWidth="16" />
    </svg>
  );
}
