import type { MessagingId } from "@halonicjs/ports";
import {
  COPIED_FOR_MS,
  clockTime,
  Kbd,
  standaloneLinkClasses,
  TickIcon,
  useWriteClipboard,
} from "@halonicjs/studio-kit";
import { Fragment, useEffect, useState } from "react";
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
  /** The hint row's id, so the text box can name its keys from it; none while the box opens. */
  readonly hintId?: string;
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
 * Messenger** once there's an answer, both as links, **Open in Messenger** at the right end.
 */
export function BoxFooter({
  answer,
  hintId,
  lastAnswer,
  onOpenChat,
  onOpenLastAnswer,
}: BoxFooterProps) {
  return (
    <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-surface-subtle px-3.5 py-3 text-caption text-fg-muted">
      {answer === undefined ? (
        <>
          <Hints id={hintId} />
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

/**
 * The keys, shown for the eye. Screen readers hear them once, as the text box's description, and
 * **Ask** names its own key. The spaces keep the description's words apart; the flex rows don't
 * draw them.
 */
function Hints({ id }: { readonly id: string | undefined }) {
  return (
    <p id={id} aria-hidden="true" className="flex flex-wrap items-center gap-4">
      {quickAskWords.hints.map((hint, index) => (
        <Fragment key={hint.key}>
          {index > 0 ? " " : null}
          <span className="inline-flex items-center gap-1.5">
            <Kbd keys={[hint.key]} /> {hint.does}
          </span>
        </Fragment>
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
      className={`ms-auto ${standaloneLinkClasses}`}
      onClick={() => onOpen(lastAnswer)}
    >
      {quickAskWords.lastAnswer(lastAnswer.agentName, time)}
      {/* The chevron only shows the link goes somewhere; screen readers would read it out. */}
      <span aria-hidden="true"> ›</span>
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
  return (
    <>
      <CopyAnswer text={answer.text} />
      <button
        type="button"
        className={`ms-auto ${standaloneLinkClasses}`}
        onClick={() => onOpenChat(answer.conversation)}
      >
        {quickAskWords.openInMessenger}
      </button>
    </>
  );
}

type CopyState = "ready" | "copied" | "failed";

/**
 * **Copy**, which says what it did in its own place for 2 s (design HAL-19384): "Copied" with a
 * tick in the success colour, as the kit's Callout `doneLabel` does, or "Couldn't copy" in the
 * danger colour when the clipboard refuses. A polite status line says it to screen readers once;
 * the button keeps its name, as the kit's CopyButton does.
 */
function CopyAnswer({ text }: { readonly text: string }) {
  const writeClipboard = useWriteClipboard();
  const [state, setState] = useState<CopyState>("ready");
  // A new copy restarts the 2 s and is announced again.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (state === "ready") return;
    const timer = setTimeout(() => setState("ready"), COPIED_FOR_MS);
    return () => clearTimeout(timer);
  }, [state, attempt]);

  const copy = async () => {
    const copied = await writeClipboard(text);
    if (!copied) console.error("Quick ask couldn't put the answer on the clipboard.");
    setAttempt((previous) => previous + 1);
    setState(copied ? "copied" : "failed");
  };

  return (
    <>
      <button
        type="button"
        aria-label={quickAskWords.copy}
        className={standaloneLinkClasses}
        onClick={() => void copy()}
      >
        <CopyLabel state={state} />
      </button>
      <span role="status" className="sr-only">
        <span key={attempt}>{copyStatus(state)}</span>
      </span>
    </>
  );
}

function CopyLabel({ state }: { readonly state: CopyState }) {
  if (state === "copied") {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="inline-grid size-3.5 place-items-center text-success *:size-full">
          <TickIcon />
        </span>
        {quickAskWords.copied}
      </span>
    );
  }
  if (state === "failed") return <span className="text-danger">{quickAskWords.notCopied}</span>;
  return quickAskWords.copy;
}

function copyStatus(state: CopyState): string {
  if (state === "copied") return quickAskWords.copied;
  if (state === "failed") return quickAskWords.notCopied;
  return "";
}
