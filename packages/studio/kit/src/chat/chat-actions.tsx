import { Button } from "../button/button.tsx";
import { inlineLinkClasses } from "../external-link/external-link.tsx";

/** One thing a chat line offers: "Try again", "Open Models ›", "Sign in with Google". */
export interface ChatAction {
  /** A verb that says what happens. A way to another place ends with " ›": "Set the key ›". */
  readonly label: string;
  readonly onClick: () => void;
  /**
   * `button` (the default) is a `secondary` `sm` Button, for an action that does something here:
   * "Try again". `link` is an inline link, for a way to another place: "Open Models ›".
   */
  readonly look?: "button" | "link";
}

/** The props of `ChatActions`. */
export interface ChatActionsProps {
  readonly actions: readonly ChatAction[];
}

/**
 * A chat line's actions, in the order given, on one row that wraps. Nothing when there are none,
 * so a line without an action has no empty row under it.
 */
export function ChatActions({ actions }: ChatActionsProps) {
  if (actions.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {actions.map((action) =>
        action.look === "link" ? (
          <button
            key={action.label}
            type="button"
            className={`text-small font-medium ${inlineLinkClasses}`}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        ) : (
          <Button key={action.label} variant="secondary" size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        ),
      )}
    </div>
  );
}
