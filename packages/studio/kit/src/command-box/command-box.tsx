import { useEffect, useRef, useState } from "react";
import { Button } from "../button/button.tsx";
import { useWriteClipboard } from "../copy-button/clipboard.tsx";
import { useModalPolite } from "../dialog/modal-regions.tsx";
import { CheckIcon } from "../icons/check-icon.tsx";
import { CopyIcon } from "../icons/copy-icon.tsx";
import { useToastStore } from "../toast/toast-provider.tsx";

/** What the CommandBox says once the command is on the clipboard. */
export const COMMAND_COPIED = "Copied";

/** What it says when neither way of copying worked. The command is left selected. */
export const COMMAND_NOT_COPIED = "Couldn't copy. Select the command and copy it.";

/** The props of `CommandBox`. */
export interface CommandBoxProps {
  /** The command, exactly as it's run: "halonic trust ~/work/acme". Shown and copied as is. */
  readonly command: string;
}

type Outcome = "copied" | "failed" | null;

/**
 * The command's box: `font-mono` `text-small` on `surface-muted`. It wraps rather than scrolling
 * sideways, and one click selects the whole command.
 *
 * It breaks only between shell words, so `--filter` or a path stays whole; only a single word
 * wider than the whole box breaks inside. It keeps at least 192px beside Copy: in a narrower place
 * Copy goes under the command, instead of squeezing it into a column a few letters wide.
 */
const textClasses =
  "min-w-0 grow basis-48 rounded-xs bg-surface-muted px-2 py-1.5 font-mono text-small text-fg select-all";

/**
 * One shell word. As an inline block it never breaks after the hyphen of `--filter`: the line
 * breaks only at the spaces between words. A word wider than the box is held to its width and
 * breaks anywhere inside, so the box still never scrolls sideways.
 */
const wordClasses = "inline-block max-w-full wrap-anywhere";

const captionClasses = "basis-full text-caption text-fg-muted";

/** The check that stands in for the copy icon, in the success colour. */
function CopiedIcon() {
  return (
    <span className="inline-grid text-success *:size-full">
      <CheckIcon />
    </span>
  );
}

/**
 * A command to copy and run on your computer: Trust's `halonic trust …`, the serve key block.
 * The copy button is named "Copy command" and keeps that name after copying.
 *
 * It confirms with a "Copied" toast. Inside a Dialog, where toasts wait until it closes, it says
 * "Copied" through the Dialog's polite region instead, and shows a check in place of its icon
 * until the button loses focus. When copying fails, the command is left selected and the message
 * says to copy it by hand. The screen passes nothing for any of this.
 *
 * @example
 * <CommandBox command="halonic trust ~/work/acme" />
 */
export function CommandBox({ command }: CommandBoxProps) {
  const writeClipboard = useWriteClipboard();
  const modal = useModalPolite();
  const toasts = useToastStore();
  const text = useRef<HTMLElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  // A new copy is announced again by the box's own status line.
  const [attempt, setAttempt] = useState(0);

  // The check stays until focus leaves the button.
  useEffect(() => {
    const element = button.current;
    if (element === null) {
      return;
    }
    const clearCheck = () => setOutcome((current) => (current === "copied" ? null : current));
    element.addEventListener("blur", clearCheck);
    return () => element.removeEventListener("blur", clearCheck);
  }, []);

  async function copy() {
    const copied = await writeClipboard(command);
    if (!copied && text.current !== null) {
      // The last way left: the user copies the selected command by hand.
      window.getSelection()?.selectAllChildren(text.current);
    }
    setAttempt((previous) => previous + 1);
    setOutcome(copied ? "copied" : "failed");
    const message = copied ? COMMAND_COPIED : COMMAND_NOT_COPIED;
    if (modal !== null) {
      modal.say(message);
      return;
    }
    toasts?.show({ tone: copied ? "success" : "warning", title: message });
  }

  const inModal = modal !== null;
  return (
    <div className="flex flex-wrap items-start gap-x-1 gap-y-1.5 phone:items-center">
      <code ref={text} className={textClasses}>
        <CommandWords command={command} />
      </code>
      <Button
        variant="ghost"
        size="sm"
        icon={inModal && outcome === "copied" ? <CopiedIcon /> : <CopyIcon />}
        label="Copy command"
        ref={button}
        onClick={copy}
      />
      <OutcomeLine
        outcome={outcome}
        attempt={attempt}
        reportsItself={!inModal && toasts === null}
        shown={inModal || toasts === null}
      />
    </div>
  );
}

/**
 * The command's words, each in its own span, with the spaces between them kept as they are, so
 * the text (and what a hand copy gets) is the command exactly.
 */
function CommandWords({ command }: { command: string }) {
  // Splitting on a captured run of spaces keeps the runs: words and spaces alternate.
  const pieces = command.split(/(\s+)/);
  return pieces.map((piece, index) =>
    index % 2 === 1 || piece === "" ? (
      piece
    ) : (
      <span key={index} className={wordClasses}>
        {piece}
      </span>
    ),
  );
}

/**
 * The line under the box. A failure is shown there when no toast says it. With neither a Dialog
 * nor a toast store round the box (a test, the states page), the line is a status region too.
 */
function OutcomeLine({
  outcome,
  attempt,
  reportsItself,
  shown,
}: {
  outcome: Outcome;
  attempt: number;
  reportsItself: boolean;
  shown: boolean;
}) {
  const visible = shown && outcome === "failed";
  const message = outcome === "failed" ? COMMAND_NOT_COPIED : COMMAND_COPIED;
  if (reportsItself) {
    return (
      <p role="status" className={visible ? captionClasses : "sr-only"}>
        {outcome === null ? null : <span key={attempt}>{message}</span>}
      </p>
    );
  }
  return visible ? <p className={captionClasses}>{message}</p> : null;
}
