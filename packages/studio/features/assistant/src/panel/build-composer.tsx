import { findSecretShape } from "@halonicjs/std";
import {
  type ButtonUnavailable,
  type ChatAction,
  ChatBoxLine,
  ChatComposer,
} from "@halonicjs/studio-kit";
import { type RefObject, useState } from "react";
import { buildChatWords as words } from "../chat/build-chat-words.ts";

/** The props of {@link BuildComposer}. */
export interface BuildComposerProps {
  readonly answering: boolean;
  /** The box, where the panel puts focus when it opens and after New chat. */
  readonly box: RefObject<HTMLTextAreaElement | null>;
  /**
   * Sends the message; answers whether it went, so the box empties only then. `putBack` puts it
   * back in the box when it wasn't sent after all, unless the person already wrote another.
   */
  readonly onSend: (message: string, putBack: (message: string) => void) => boolean;
  readonly onStop: () => void;
  /** Send waits, pointing at the visible reason: the engine's line at the top (H12, D5). */
  readonly sendUnavailable?: ButtonUnavailable | undefined;
  /** Opens where keys are kept, for a message held because it looks like it holds one. */
  readonly onGoToKeyField?: (() => void) | undefined;
}

/**
 * The Build chat's box (flow-assistant 5.1): named "Message the assistant", with "Ask for a
 * change…". Enter sends and empties it; while the chat answers, Stop takes Send's place and Enter
 * sends nothing, keeping the text (`assistant.chat.enter-sends`, `assistant.chat.stop`). A message
 * that looks like it holds a key isn't sent: it stays in the box under the key line, with **Send
 * anyway**, until the text changes (`assistant.chat.key-in-message`, H29).
 */
export function BuildComposer(props: BuildComposerProps) {
  const { answering, box, onSend } = props;
  const [draft, setDraft] = useState("");
  const [heldForKey, setHeldForKey] = useState(false);
  const putBack = (message: string) => setDraft((current) => (current === "" ? message : current));
  const send = ({ keyChecked = false } = {}) => {
    if (!keyChecked && findSecretShape(draft) !== undefined) {
      setHeldForKey(true);
      return;
    }
    if (!onSend(draft, putBack)) return;
    setDraft("");
    setHeldForKey(false);
  };
  const edit = (text: string) => {
    setDraft(text);
    setHeldForKey(false);
  };
  // Send anyway takes its line away, so focus goes to the box rather than the page (C505-3).
  const sendAnyway = () => {
    box.current?.focus();
    send({ keyChecked: true });
  };
  const goToKeyField = props.onGoToKeyField;
  const offers: ChatAction[] = [
    ...(goToKeyField === undefined
      ? []
      : [{ label: words.goToKeyField, onClick: goToKeyField, look: "link" as const }]),
    { label: words.sendAnyway, onClick: sendAnyway },
  ];
  return (
    <div className="px-4 pt-2 pb-3">
      <ChatComposer
        label={words.boxLabel}
        placeholder={words.placeholder}
        value={draft}
        onChange={edit}
        onSend={() => send()}
        onStop={props.onStop}
        answering={answering}
        sendUnavailable={props.sendUnavailable}
        textRef={box}
        line={
          heldForKey ? (
            <ChatBoxLine tone="warning" actions={offers}>
              {words.keyInMessage}
            </ChatBoxLine>
          ) : undefined
        }
      />
    </div>
  );
}
