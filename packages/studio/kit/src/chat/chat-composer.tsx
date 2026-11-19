import type { KeyboardEvent, ReactNode, Ref } from "react";
import { Button, type ButtonUnavailable } from "../button/button.tsx";
import { TextArea } from "../input/text-area.tsx";

/** The props of `ChatComposer`. */
export interface ChatComposerProps {
  /** The box's name for screen readers: "Message Sorter". */
  readonly label: string;
  /** "Message Sorter…", "Ask for a change…". */
  readonly placeholder: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Called with a message that isn't blank, by Send or Enter. The feature clears the box. */
  readonly onSend: () => void;
  /** Called by Stop while a reply is being written. */
  readonly onStop: () => void;
  /** A reply is being written: Stop takes Send's place, and Enter sends nothing. */
  readonly answering: boolean;
  /**
   * Send waits, pointing at the visible reason: the transcript's notice while the engine isn't
   * answering. The message stays in the box.
   */
  readonly sendUnavailable?: ButtonUnavailable | undefined;
  /** The line under the box, when something stops the message: a `ChatBoxLine`. */
  readonly line?: ReactNode;
  /** The box itself, so the feature can put focus in it after Try again or New chat. */
  readonly textRef?: Ref<HTMLTextAreaElement>;
}

/** The box grows to this many lines, then scrolls. */
const MAX_ROWS = 8;

/**
 * A chat's message box with its Send button, and the line under it. Enter sends and Shift Enter
 * adds a line; neither does anything while an input method is composing (the TextArea's rule).
 * Enter sends nothing while a reply is being written, while Send waits, or when the message is
 * blank, and the text stays.
 *
 * While `answering`, the button is **Stop**. It's the same button, so focus stays on it, and
 * after the reply it's **Send** again, still focused.
 *
 * The line under the box sits in a status region that's always there, so a screen reader reads
 * the line once when it appears or changes.
 *
 * @example
 * <ChatComposer
 *   label="Message Sorter"
 *   placeholder="Message Sorter…"
 *   value={draft}
 *   onChange={setDraft}
 *   onSend={send}
 *   onStop={stop}
 *   answering={answering}
 * />
 */
export function ChatComposer(props: ChatComposerProps) {
  const { value, answering, sendUnavailable } = props;
  const canSend = !answering && sendUnavailable === undefined && value.trim() !== "";

  function send() {
    if (canSend) {
      props.onSend();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }
    event.preventDefault();
    send();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <TextArea
            ref={props.textRef ?? null}
            aria-label={props.label}
            placeholder={props.placeholder}
            value={value}
            maxRows={MAX_ROWS}
            onChange={(event) => props.onChange(event.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        {/* One key for both, so React keeps the one button and focus stays on it. */}
        {answering ? (
          <Button key="send-or-stop" variant="secondary" onClick={props.onStop}>
            Stop
          </Button>
        ) : (
          <Button key="send-or-stop" variant="primary" unavailable={sendUnavailable} onClick={send}>
            Send
          </Button>
        )}
      </div>
      <div role="status">{props.line}</div>
    </div>
  );
}
