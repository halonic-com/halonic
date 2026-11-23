import { ChatComposer } from "@halonicjs/studio-kit";
import { type RefObject, useState } from "react";
import { buildChatWords as words } from "../chat/build-chat-words.ts";

/** The props of {@link BuildComposer}. */
export interface BuildComposerProps {
  readonly answering: boolean;
  /** The box, where the panel puts focus when it opens and after New chat. */
  readonly box: RefObject<HTMLTextAreaElement | null>;
  /** Sends the message; answers whether it went, so the box empties only then. */
  readonly onSend: (message: string) => boolean;
  readonly onStop: () => void;
}

/**
 * The Build chat's box (flow-assistant 5.1): named "Message the assistant", with "Ask for a
 * change…". Enter sends and empties it; while the chat answers, Stop takes Send's place and Enter
 * sends nothing, keeping the text (`assistant.chat.enter-sends`, `assistant.chat.stop`).
 */
export function BuildComposer({ answering, box, onSend, onStop }: BuildComposerProps) {
  const [draft, setDraft] = useState("");
  return (
    <div className="px-4 pt-2 pb-3">
      <ChatComposer
        label={words.boxLabel}
        placeholder={words.placeholder}
        value={draft}
        onChange={setDraft}
        onSend={() => {
          if (onSend(draft)) setDraft("");
        }}
        onStop={onStop}
        answering={answering}
        textRef={box}
      />
    </div>
  );
}
