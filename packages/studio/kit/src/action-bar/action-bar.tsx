import { type MouseEvent, type ReactNode, useId } from "react";
import { Button } from "../button/button.tsx";

/** One of the bar's buttons. Always `size="touch"` and full width: the bar draws it. */
export interface ActionBarButton {
  /** The label: a verb that says what happens. "Approve", "Send note to the agent". */
  readonly label: string;
  /** `primary` for the one decision, at most once and first. Everything else is `secondary`. */
  readonly variant?: "primary" | "secondary";
  /** An optional 16px icon on the left: the chat icon on Try it. */
  readonly icon?: ReactNode;
  /** The label while busy: "Approving…". */
  readonly busyLabel?: string;
  /**
   * While its request runs. The other buttons in the bar are then unavailable, with this one's
   * busy label as their reason, and every click is ignored until it's done.
   */
  readonly busy?: boolean;
  /** `submit` only for a form sheet's confirming button. */
  readonly type?: "button" | "submit";
  readonly onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}

/** A row of the bar: one button on its own, or two that share the row. */
export type ActionBarRow = readonly [ActionBarButton] | readonly [ActionBarButton, ActionBarButton];

/** The colour of the line above the buttons. */
export type ActionBarNoteTone = "muted" | "warning" | "danger";

export interface ActionBarProps {
  /** The rows, top to bottom. The `primary` button, if any, is the first of the first row. */
  readonly rows: readonly ActionBarRow[];
  /**
   * An optional line above the buttons, never shortened: "Sending is off until you connect
   * Gmail." in `warning`.
   */
  readonly note?: { readonly text: string; readonly tone?: ActionBarNoteTone };
  /**
   * `ride` (the default) keeps the bar on top of the keyboard while you type: for a bar that
   * confirms what you're typing (a form sheet's button, the decision bar). `hide` drops it while a
   * text field in the page's scroll area has focus: for a bar about something else (Run now, Try
   * it), so it can't cover the field's error.
   */
  readonly whileTyping?: "ride" | "hide";
}

const noteTones: Record<ActionBarNoteTone, string> = {
  muted: "text-fg-muted",
  warning: "text-warning",
  danger: "text-danger",
};

/**
 * The bar an opened page or sheet puts on the bottom edge instead of the bottom navigation: the
 * last row of the page's column, never `position: fixed`, so nothing hides behind it. A `surface`
 * fill with a `border` line on top, padding 12px 16px and the safe area at the bottom; it grows
 * with its content. Its buttons are 48px and full width: two in a row share it with 8px between
 * them, and stack, in the same order, when either label doesn't fit its half. At most one
 * `primary`, and it comes first. When the action can't happen at all, don't show the bar.
 *
 * @example
 * <ActionBar
 *   rows={[
 *     [{ label: "Approve", variant: "primary", onClick: approve }],
 *     [{ label: "Ask for changes", onClick: ask }, { label: "Reject", onClick: reject }],
 *   ]}
 * />
 */
export function ActionBar({ rows, note, whileTyping = "ride" }: ActionBarProps) {
  checkPrimary(rows);
  const busyId = useId();
  const busy = rows.flat().some((button) => button.busy === true);
  return (
    <div
      data-while-typing={whileTyping}
      className="action-bar flex flex-col gap-2 border-t border-border bg-surface px-4 pt-3 pb-safe"
    >
      {note === undefined ? null : (
        <p className={`text-small wrap-break-word ${noteTones[note.tone ?? "muted"]}`}>
          {note.text}
        </p>
      )}
      {rows.map((row, index) => (
        <div
          // Rows are given in a fixed order and never move, so a row's place is its identity.
          key={index}
          className="flex flex-wrap gap-2"
        >
          {row.map((button) => (
            <div
              key={button.label}
              className="flex min-w-fit flex-1 basis-[calc(50%-var(--spacing))]"
            >
              <Button
                {...(button.busy === true ? { id: busyId } : {})}
                variant={button.variant ?? "secondary"}
                size="touch"
                block
                {...(button.icon === undefined ? {} : { icon: button.icon })}
                busy={button.busy === true}
                busyLabel={button.busyLabel}
                unavailable={busy && button.busy !== true ? { reason: busyId } : undefined}
                type={button.type ?? "button"}
                onClick={button.onClick}
              >
                {button.label}
              </Button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** At most one `primary`, and it's the first button: a mistake here is the screen's, not the user's. */
function checkPrimary(rows: readonly ActionBarRow[]): void {
  const primaries = rows
    .flat()
    .flatMap((button, index) => (button.variant === "primary" ? [index] : []));
  if (primaries.length > 1 || (primaries.length === 1 && primaries[0] !== 0)) {
    throw new Error("An ActionBar has at most one primary button, and it comes first.");
  }
}
