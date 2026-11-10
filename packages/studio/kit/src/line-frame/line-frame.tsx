import type { ReactNode } from "react";

/** The line's one action, a text button at its right: "Turn on". */
export interface LineFrameAction {
  /** A verb that says what happens: "Turn on", "Share". */
  readonly label: string;
  readonly onClick: () => void;
}

export interface LineFrameProps {
  /**
   * A 16px icon from the kit's set, in the colour its parent gives it (`fg` unless `muted`).
   * Decoration: the text says the same.
   */
  readonly icon: ReactNode;
  /** The icon and the text in `fg-muted`, for a calm line such as the ViewOnlyLine. */
  readonly muted?: boolean;
  /**
   * An action at the right, such as the Changes feature's sharing strip has. When the text and
   * the action don't fit side by side (200% text), the action goes under the text.
   */
  readonly action?: LineFrameAction;
  /** The line's text. Never shortened: it wraps. */
  readonly children: ReactNode;
}

/**
 * A text button in `accent-text` with no padding, so under the text it starts where the text
 * does; hover underlines it, and on touch its 48px hit area is a pseudo-element.
 */
const actionClasses = [
  "ml-auto max-w-full flex-none rounded-xs text-left text-small font-medium text-accent-text",
  "hover:underline focus-ring phone:hit-touch touch:hit-touch",
].join(" ");

/**
 * The frame of a plain line at the top of a page: padding 8px 16px, at least 48px high, a 1px
 * `border` below and no fill, with a 16px icon top-aligned with the first line of `text-small`
 * text. The ViewOnlyLine is this frame with the eye. It isn't a callout and isn't live: it's a
 * calm fact about the page, read in order.
 *
 * @example
 * <LineFrame icon={<ShareIcon />}>Shared with your team.</LineFrame>
 * <LineFrame icon={<LinkIcon />} action={{ label: "Turn on", onClick: turnOn }}>
 *   Sharing is off for this workspace.
 * </LineFrame>
 */
export function LineFrame({ icon, muted = false, action, children }: LineFrameProps) {
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
      {action === undefined ? (
        <p className="min-w-0 flex-1 wrap-break-word">{children}</p>
      ) : (
        // The text and the action wrap as one group, so a long text pushes the action under it.
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
          <p className="min-w-0 flex-[1_1_10rem] wrap-break-word">{children}</p>
          <button type="button" className={actionClasses} onClick={action.onClick}>
            {action.label}
          </button>
        </div>
      )}
    </div>
  );
}
