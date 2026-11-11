import { BackIcon, Button } from "@halonicjs/studio-kit";
import type { ReactNode } from "react";

/** Props for {@link PhoneTopBar}. */
export interface PhoneTopBarProps {
  /** The place name on a place ("Inbox"), else the page's title ("Support reply"). */
  readonly title: string;
  /**
   * Goes one page up. Left out at the top of a place (Home, Inbox, Runs, More), which has no Back
   * button (component specs 0.2, "Where Back goes").
   */
  readonly onBack?: (() => void) | undefined;
  /**
   * Up to two 48px icon buttons at the right: on a place, Search and the Assistant; on a page, its
   * ⋮ menu or a position ("1 of 3"). Only what is built is passed, so nothing stands in for it.
   */
  readonly actions?: ReactNode;
}

/**
 * The phone's top bar (component specs 15.1, VK T2-F11): at least 56px plus the top safe area, a
 * `border` line below, padding 0 4px with 4px between its parts, on the sticky layer. **Back** sits at the top left as
 * a 48px icon button, and only under the top of a place. The title follows it on one line, left
 * aligned so a long name gets the room, and ends in "…" when it doesn't fit; at the top of a place
 * it starts 16px in. The actions sit at the right.
 *
 * The title isn't a heading: the page under it keeps its own `h1`, which the shell moves focus to
 * after a move, as on the desktop. The top bar is the window's `header`, so a screen reader can
 * jump to it.
 *
 * @example
 * <PhoneTopBar title="Support reply" onBack={() => setStacks(goBackOnPhone(stacks))} />
 */
export function PhoneTopBar({ title, onBack, actions }: PhoneTopBarProps) {
  return (
    <header className="relative z-(--layer-sticky) flex min-h-phone-bar shrink-0 items-center gap-1 border-b border-border bg-surface px-1 pt-safe">
      {onBack === undefined ? null : (
        <Button variant="ghost" size="lg" icon={<BackIcon />} label="Back" onClick={onBack} />
      )}
      <p className={`min-w-0 flex-1 truncate text-heading${onBack === undefined ? " ps-3" : ""}`}>
        {title}
      </p>
      {actions === undefined ? null : <div className="flex shrink-0 gap-1">{actions}</div>}
    </header>
  );
}
