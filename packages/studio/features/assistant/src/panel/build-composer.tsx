import {
  type ButtonUnavailable,
  type ChatAction,
  ChatBoxLine,
  ChatComposer,
} from "@halonicjs/studio-kit";
import { type ChatSecretHold, chatSecretHold } from "@halonicjs/studio-shell";
import {
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
  useEffect,
  useState,
} from "react";
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
  /** The chat answers with the authoring tools only, before trust (H17): the line says so. */
  readonly authoringOnly?: boolean | undefined;
  /** **Review** on that line: opens the window's trust check. */
  readonly onReviewTrust?: (() => void) | undefined;
  /** The chat model's line under the box (states H18 to H20), unless the key line shows. */
  readonly line?: ReactNode;
  /** Set while the model's line holds Send: pressing it calls this and sends nothing. */
  readonly onSendHeld?: (() => void) | undefined;
  /** An agent chat's own name and placeholder: "Message Triage" and "Message Triage…". */
  readonly label?: string;
  readonly placeholder?: string;
  /** The start screen's glow round the box (`assistant.start-screen.halo`). */
  readonly glow?: boolean | undefined;
  /** Asks the box for focus, holding `text` when given, with the caret at its end. */
  readonly request?: { readonly text?: string | undefined } | undefined;
  /** The box did what `request` asked. */
  readonly onRequestDone?: (() => void) | undefined;
}

/**
 * The Build chat's box (flow-assistant 5.1): named "Message the assistant", with "Ask for a
 * change…". Enter sends and empties it; while the chat answers, Stop takes Send's place and Enter
 * sends nothing, keeping the text (`assistant.chat.enter-sends`, `assistant.chat.stop`). A message
 * that looks like it holds a key isn't sent: it stays in the box under the key line, with **Send
 * anyway**, until the text changes (`assistant.chat.key-in-message`, H29); a Google client secret
 * gets its own line and no way to the key field, which is for other keys. Otherwise the chat
 * model's line shows under it, which may hold Send (`assistant.chat.model-line`, H18 to H20), or
 * else, before trust, the muted line says the chat can read and propose but not run anything, with
 * **Review** (`assistant.chat.authoring-only`, H17).
 */
export function BuildComposer(props: BuildComposerProps) {
  const { answering, box, onSend } = props;
  const { label = words.boxLabel, placeholder = words.placeholder } = props;
  const [draft, setDraft] = useState("");
  const [held, setHeld] = useState<ChatSecretHold | undefined>(undefined);
  useBoxRequest(props, setDraft);
  const putBack = (message: string) => setDraft((current) => (current === "" ? message : current));
  const send = ({ keyChecked = false } = {}) => {
    if (props.onSendHeld !== undefined) {
      props.onSendHeld();
      return;
    }
    const hold = keyChecked ? undefined : chatSecretHold(draft);
    if (hold !== undefined) {
      setHeld(hold);
      return;
    }
    if (!onSend(draft, putBack)) return;
    setDraft("");
    setHeld(undefined);
  };
  const edit = (text: string) => {
    setDraft(text);
    setHeld(undefined);
  };
  // Send anyway takes its line away, so focus goes to the box rather than the page (C505-3).
  const sendAnyway = () => {
    box.current?.focus();
    send({ keyChecked: true });
  };
  const goToKeyField = props.onGoToKeyField;
  const offers: ChatAction[] = [
    ...(goToKeyField === undefined || held?.keyField !== true
      ? []
      : [{ label: words.goToKeyField, onClick: goToKeyField, look: "link" as const }]),
    { label: words.sendAnyway, onClick: sendAnyway },
  ];
  // The glow goes on a wrapper, since the box's focus look is its own shadow (flow-assistant 6.2).
  return (
    <div className="px-4 pt-2 pb-3">
      <div className={props.glow === true ? "rounded-composer shadow-halo-glow" : undefined}>
        <ChatComposer
          label={label}
          placeholder={placeholder}
          value={draft}
          onChange={edit}
          onSend={() => send()}
          onStop={props.onStop}
          answering={answering}
          sendUnavailable={props.sendUnavailable}
          textRef={box}
          line={
            held !== undefined ? (
              <ChatBoxLine tone="warning" actions={offers}>
                {held.line}
              </ChatBoxLine>
            ) : (
              (props.line ?? <AuthoringLine {...props} />)
            )
          }
        />
      </div>
    </div>
  );
}

/**
 * Does what the box is asked once: puts the text in when there is one, after any unsent text
 * in a new paragraph so nothing typed is lost (`assistant.chat.describe`), then moves focus into the
 * box with the caret at the end, once the text is drawn (flow-workflows 2.2).
 */
function useBoxRequest(
  { request, onRequestDone, box }: BuildComposerProps,
  setDraft: Dispatch<SetStateAction<string>>,
): void {
  const [caretToEnd, setCaretToEnd] = useState(0);
  useEffect(() => {
    if (request === undefined) return;
    const text = request.text;
    if (text !== undefined)
      setDraft((typed) => (typed.trim() === "" ? text : `${typed}\n\n${text}`));
    setCaretToEnd((count) => count + 1);
    onRequestDone?.();
  }, [request, onRequestDone, setDraft]);
  useEffect(() => {
    const area = box.current;
    if (caretToEnd === 0 || area === null) return;
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
  }, [caretToEnd, box]);
}

/** The H17 line, or nothing once the workspace is trusted or the chat is on another model. */
function AuthoringLine({ authoringOnly, onReviewTrust }: BuildComposerProps) {
  if (authoringOnly !== true) return null;
  const review: ChatAction[] =
    onReviewTrust === undefined
      ? []
      : [{ label: words.review, onClick: onReviewTrust, look: "link" }];
  return (
    <ChatBoxLine tone="muted" actions={review}>
      {words.authoringOnly}
    </ChatBoxLine>
  );
}
