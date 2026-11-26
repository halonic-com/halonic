import type { MessagingId } from "@halonicjs/ports";
import { Button, clockTime, copyText, Kbd, standaloneLinkClasses } from "@halonicjs/studio-kit";
import type { LastAnswer } from "../ask-session.ts";
import { quickAskWords } from "../quick-ask-words.ts";

/** The newest answer, once there is one: its text for **Copy** and the chat it came in. */
export interface FooterAnswer {
  readonly text: string;
  readonly conversation: MessagingId;
}

/** The props of {@link BoxFooter}. */
export interface BoxFooterProps {
  readonly answer: FooterAnswer | undefined;
  /** An answer that came after the box closed, linked at the end of the hint row. */
  readonly lastAnswer: LastAnswer | undefined;
  /** Opens `conversation` in Messenger. */
  readonly onOpenChat: (conversation: MessagingId) => void;
  /** Opens the last answer's chat, and forgets it. */
  readonly onOpenLastAnswer: (lastAnswer: LastAnswer) => void;
}

/**
 * The one footer of every state, on the hint row's tint (design HAL-18594, sections 4–5): the keys
 * and **Last answer ›** when an answer came while the box was closed, or **Copy** and **Open in
 * Messenger** once there's an answer.
 */
export function BoxFooter({ answer, lastAnswer, onOpenChat, onOpenLastAnswer }: BoxFooterProps) {
  return (
    <footer className="flex items-center gap-4 border-t border-border bg-surface-subtle px-3.5 py-3 text-caption text-fg-muted">
      {answer === undefined ? (
        <>
          <Hints />
          {lastAnswer === undefined ? null : (
            <LastAnswerLink lastAnswer={lastAnswer} onOpen={onOpenLastAnswer} />
          )}
        </>
      ) : (
        <AnswerActions answer={answer} onOpenChat={onOpenChat} />
      )}
    </footer>
  );
}

function Hints() {
  return (
    // The keys are shown for the eye; each control names its own key for screen readers.
    <p aria-hidden="true" className="flex flex-wrap items-center gap-4">
      {quickAskWords.hints.map((hint) => (
        <span key={hint.key} className="inline-flex items-center gap-1.5">
          <Kbd keys={[hint.key]} />
          {hint.does}
        </span>
      ))}
    </p>
  );
}

function LastAnswerLink({
  lastAnswer,
  onOpen,
}: {
  readonly lastAnswer: LastAnswer;
  readonly onOpen: (lastAnswer: LastAnswer) => void;
}) {
  const time = clockTime(new Date(lastAnswer.sentAt), new Date());
  return (
    <button
      type="button"
      className={`ml-auto ${standaloneLinkClasses}`}
      onClick={() => onOpen(lastAnswer)}
    >
      {quickAskWords.lastAnswer(lastAnswer.agentName, time)}
    </button>
  );
}

function AnswerActions({
  answer,
  onOpenChat,
}: {
  readonly answer: FooterAnswer;
  readonly onOpenChat: (conversation: MessagingId) => void;
}) {
  const copy = () =>
    copyText(answer.text).then((copied) => {
      if (!copied) console.error("Quick ask couldn't put the answer on the clipboard.");
    });
  return (
    <>
      <button type="button" className={standaloneLinkClasses} onClick={() => void copy()}>
        {quickAskWords.copy}
      </button>
      <Button variant="ghost" size="xs" onClick={() => onOpenChat(answer.conversation)}>
        {quickAskWords.openInMessenger}
      </Button>
    </>
  );
}
