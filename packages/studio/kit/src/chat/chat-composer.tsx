import type { KeyboardEvent, ReactNode, Ref } from "react";
import { Button, type ButtonUnavailable } from "../button/button.tsx";
import { ArrowUpIcon, StopIcon } from "../icons/prompt-icons.tsx";
import { TextArea } from "../input/text-area.tsx";
import { type ChatComposerPicker, ChatPickerList, useChatPicker } from "./chat-picker.tsx";

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
  /**
   * A list the box opens above itself while the person types, such as a channel's `@` members.
   * With it, the box is a combobox that names the active row, and ↑↓, Enter and Esc are the
   * picker's while it's open.
   */
  readonly picker?: ChatComposerPicker | undefined;
  /** A line inside the box's frame, above the text: a channel's To line and its chips. */
  readonly header?: ReactNode;
  /** A round 36px button inside the box, before the text: the Messenger's Attach a file. */
  readonly leading?: ReactNode;
}

/** The box grows to this many lines, then scrolls. */
const MAX_ROWS = 8;

/**
 * A chat's message box, the new design's floating pill (HAL-20728, `kit.prompt-look`), with its round Send inside it at the
 * right, and the line under it. Send is grey while there's nothing to send and blue once there is. Enter sends and Shift Enter
 * adds a line; neither does anything while an input method is composing (the TextArea's rule).
 * Enter sends nothing while a reply is being written, while Send waits, or when the message is
 * blank, and the text stays.
 *
 * While `answering`, the button is **Stop**, a square in the same place. It's the same button, so focus stays on it, and
 * after the reply it's **Send** again, still focused.
 *
 * With a `picker` open, ↑↓ move its active row, Enter picks it instead of sending, and Esc
 * closes it. The box stays focused and points at the active row with `aria-activedescendant`.
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
  const picker = useChatPicker(props.picker);

  function send() {
    if (canSend) {
      props.onSend();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (picker.handleKey(event) || event.key !== "Enter" || event.shiftKey) {
      return;
    }
    event.preventDefault();
    send();
  }

  return (
    <div className="flex flex-col gap-2">
      {props.picker === undefined ? null : <ChatPickerList picker={props.picker} state={picker} />}
      <TextArea
        ref={props.textRef ?? null}
        look="prompt"
        aria-label={props.label}
        placeholder={props.placeholder}
        value={value}
        maxRows={MAX_ROWS}
        onChange={(event) => props.onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        header={props.header}
        leading={props.leading}
        trailing={
          // One key for both, so React keeps the one button and focus stays on it.
          answering ? (
            <Button
              key="send-or-stop"
              variant="soft"
              size="prompt"
              round
              icon={<StopIcon />}
              label="Stop"
              onClick={props.onStop}
            />
          ) : (
            <Button
              key="send-or-stop"
              variant={value.trim() === "" ? "soft" : "primary"}
              size="prompt"
              round
              icon={<ArrowUpIcon />}
              label="Send"
              unavailable={sendUnavailable}
              onClick={send}
            />
          )
        }
        {...picker.boxAttributes}
      />
      <div role="status">{props.line}</div>
    </div>
  );
}
