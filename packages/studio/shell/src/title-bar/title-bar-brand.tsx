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

/** The app's ring, in the blue to teal of the app icon, 16px like a tab's icon. */
function HalonicMark({ named }: { readonly named: boolean }) {
  return (
    <svg
      viewBox="0 0 512 512"
      className="size-icon-sm shrink-0"
      role={named ? "img" : undefined}
      aria-label={named ? "Halonic Studio" : undefined}
      aria-hidden={named ? undefined : true}
    >
      <defs>
        <linearGradient
          id="halonic-mark"
          gradientUnits="userSpaceOnUse"
          x1="16"
          y1="16"
          x2="496"
          y2="496"
        >
          <stop offset="0" stopColor="#2668ed" />
          <stop offset="1" stopColor="#14b8a2" />
        </linearGradient>
      </defs>
      <circle
        cx="256"
        cy="256"
        r="211.2"
        fill="none"
        stroke="url(#halonic-mark)"
        strokeWidth="57.6"
      />
    </svg>
  );
}
