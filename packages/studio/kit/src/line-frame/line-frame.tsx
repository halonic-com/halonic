import type { ReactNode } from "react";

export interface LineFrameProps {
  /**
   * A 16px icon from the kit's set, in the colour its parent gives it (`fg` unless `muted`).
   * Decoration: the text says the same.
   */
  readonly icon: ReactNode;
  /** The icon and the text in `fg-muted`, for a calm line such as the ViewOnlyLine. */
  readonly muted?: boolean;
  /** The line's text. Never shortened: it wraps. */
  readonly children: ReactNode;
}

/**
 * The frame of a plain line at the top of a page: padding 8px 16px, at least 48px high, a 1px
 * `border` below and no fill, with a 16px icon top-aligned with the first line of `text-small`
 * text. The ViewOnlyLine is this frame with the eye. It isn't a callout and isn't live: it's a
 * calm fact about the page, read in order.
 *
 * @example
 * <LineFrame icon={<ShareIcon />}>Shared with your team.</LineFrame>
 */
export function LineFrame({ icon, muted = false, children }: LineFrameProps) {
  return (
    <div
      className={`flex min-h-touch items-start gap-2 border-b border-border px-4 py-2 text-small ${muted ? "text-fg-muted" : "text-fg"}`}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 inline-grid size-icon-sm shrink-0 place-items-center *:size-full"
      >
        {icon}
      </span>
      <p className="min-w-0 flex-1 wrap-break-word">{children}</p>
    </div>
  );
}
