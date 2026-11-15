import { useEffect, useState } from "react";
import { useWriteClipboard } from "./clipboard.tsx";

/** How long the button says "Copied" before it says "Copy" again. */
export const COPIED_FOR_MS = 2000;

/** The props of `CopyButton`. */
export interface CopyButtonProps {
  /**
   * The text to copy: a value the user types somewhere else, such as an app name or a scope list.
   * Plain text only. A secret field's value is a `SecretText`, which isn't a string, so it can
   * never be passed here; the button also refuses one at run time.
   */
  readonly text: string;
  /** The button's name for screen readers, saying what it copies: "Copy the app name". */
  readonly label: string;
}

type CopyState = "ready" | "copied" | "failed";

/** The secondary button at the small size (base component specs, section 1). */
const buttonClasses = [
  "inline-grid h-control-sm items-center rounded-sm border border-border-strong bg-surface px-2.5",
  "text-body-strong text-fg transition-colors duration-(--duration-fast) ease-standard",
  "hover:bg-surface-subtle active:bg-surface-subtle focus-ring",
  // Like a Button: 40px with a 48px hit area on a touch screen, 48px on a phone.
  "touch:min-h-control-lg touch:px-4 touch:hit-touch phone:h-touch phone:px-4",
].join(" ");

/** "Copy" and "Copied" share one grid cell, so the button keeps the width of the longer word. */
const wordClasses = "col-start-1 row-start-1";

/**
 * A button that copies a value and says "Copied" in place for a moment. Screen readers hear
 * "Copied" too, through a status region next to the button. If the clipboard refuses, a hint
 * says to select the text and copy it by hand.
 *
 * The button and its hint join the parent's layout. Put the button in a wrapping flex row with
 * what it copies, and the hint goes on the line under the whole row, at the row's full width.
 *
 * @example
 * <CopyButton text="Halonic (own app)" label="Copy the app name" />
 */
export function CopyButton({ text, label }: CopyButtonProps) {
  refuseSecret(text);
  const writeClipboard = useWriteClipboard();
  const [state, setState] = useState<CopyState>("ready");
  // A new copy restarts the "Copied" moment and is announced again.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (state !== "copied") {
      return;
    }
    const timer = setTimeout(() => setState("ready"), COPIED_FOR_MS);
    return () => clearTimeout(timer);
  }, [state, attempt]);

  async function copy() {
    const copied = await writeClipboard(text);
    setAttempt((previous) => previous + 1);
    setState(copied ? "copied" : "failed");
  }

  return (
    // No box of its own, so the hint can take the full width of the caller's row.
    <span className="contents">
      <button type="button" aria-label={label} className={buttonClasses} onClick={copy}>
        <span className={state === "copied" ? `${wordClasses} invisible` : wordClasses}>Copy</span>
        <span className={state === "copied" ? wordClasses : `${wordClasses} invisible`}>
          Copied
        </span>
      </button>
      <span
        role="status"
        className={state === "failed" ? "block basis-full text-caption text-fg-muted" : "sr-only"}
      >
        <span key={attempt}>{statusText(state)}</span>
      </span>
    </span>
  );
}

function statusText(state: CopyState): string {
  switch (state) {
    case "ready":
      return "";
    case "copied":
      return "Copied";
    case "failed":
      return "Couldn't copy. Select the text and copy it yourself.";
  }
}

/**
 * The types already refuse a `SecretText`. This catches the rest: a cast, or a caller without
 * types, so a secret can't reach the clipboard either way.
 */
function refuseSecret(text: unknown): void {
  if (typeof text !== "string") {
    throw new TypeError(
      "CopyButton copies plain text only. A secret field's value can never be copied.",
    );
  }
}
