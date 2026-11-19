import {
  type ChatAction,
  ChatComposer,
  ChatEndLine,
  ChatMessage,
  ChatStart,
  ChatText,
  ChatToolLine,
  ChatTranscript,
} from "@halonicjs/studio-kit";
import { Fragment, type ReactNode, useRef, useState } from "react";
import type { ChatTurn, ReplyEnd, ReplyStep } from "./transcript.ts";
import { toolInWords, tryItWords } from "./try-it-words.ts";
import type { TryItChat } from "./use-try-it-chat.ts";

/** The props of {@link TryItChatView}. */
export interface TryItChatViewProps {
  readonly chat: TryItChat;
  /** The agent's name now. */
  readonly name: string;
  /** What the agent is for, under the empty chat's heading. */
  readonly description?: string | undefined;
  /** The agent's picture at 64px, above the empty chat's heading. */
  readonly figure?: ReactNode;
}

/**
 * An agent's Try it chat (flow-agents 4): the empty draft (H2), or the transcript with each reply
 * built step by step and the line it ended with, then the box. Try it is not a run in v0.1, so a
 * reply has no run line and a failure no run link (HAL-915).
 */
export function TryItChatView({ chat, name, description, figure }: TryItChatViewProps) {
  const [draft, setDraft] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  const { turns } = chat.transcript;

  const send = () => {
    chat.send(draft);
    setDraft("");
  };
  // Try again puts focus in the box, as New chat does (a11y 6.2).
  const tryAgain = () => {
    chat.tryAgain();
    box.current?.focus();
  };

  return (
    <div className="flex size-full min-h-0 flex-col">
      {turns.length === 0 ? (
        <ChatStart figure={figure} heading={tryItWords.heading(name)} description={description} />
      ) : (
        <ChatTranscript label={tryItWords.transcript(name)}>
          {turns.map((turn, index) => (
            // Turns are only added or taken back at the end, so their place is their key.
            <Fragment key={index}>
              <ChatMessage from="you">{turn.message}</ChatMessage>
              <Reply
                turn={turn}
                name={name}
                tryAgain={index === turns.length - 1 ? tryAgain : undefined}
              />
            </Fragment>
          ))}
        </ChatTranscript>
      )}
      <div className="mx-auto w-full max-w-reading px-4 pb-4">
        <ChatComposer
          label={tryItWords.boxLabel(name)}
          placeholder={tryItWords.placeholder(name)}
          value={draft}
          onChange={setDraft}
          onSend={send}
          onStop={chat.stop}
          answering={chat.answering}
          textRef={box}
        />
      </div>
    </div>
  );
}

function Reply({
  turn,
  name,
  tryAgain,
}: {
  readonly turn: ChatTurn;
  readonly name: string;
  /** Only the last reply offers Try again: it sends its message again. */
  readonly tryAgain: (() => void) | undefined;
}) {
  return (
    <ChatMessage from="reply" heading={tryItWords.said(name)}>
      {turn.steps.map((step, index) => (
        // Steps are only added at the end, so their place is their key.
        <Step key={index} step={step} />
      ))}
      {turn.end === undefined ? null : <EndLine end={turn.end} name={name} tryAgain={tryAgain} />}
    </ChatMessage>
  );
}

function Step({ step }: { readonly step: ReplyStep }) {
  if (step.kind === "text") return <ChatText>{step.text}</ChatText>;
  const tool = toolInWords(step.name);
  return <ChatToolLine state={step.state}>{tryItWords.tool[step.state](tool)}</ChatToolLine>;
}

/**
 * The line a reply ends with (mc 8.3; states H13, H23, H24). Try again only when no tool ran,
 * since sending again could repeat what a tool did; after a tool, the sentence says to send a new
 * message instead. A reply that was simply answered has no line.
 */
function EndLine({
  end,
  name,
  tryAgain,
}: {
  readonly end: ReplyEnd;
  readonly name: string;
  readonly tryAgain: (() => void) | undefined;
}) {
  const again: ChatAction[] =
    tryAgain === undefined ? [] : [{ label: tryItWords.tryAgain, onClick: tryAgain }];
  switch (end.kind) {
    case "answered":
      return null;
    case "stopped":
      return <ChatEndLine tone="plain">{tryItWords.stoppedByYou}</ChatEndLine>;
    case "turn-limit":
      return <ChatEndLine tone="plain">{tryItWords.turnLimit(name, end.turns)}</ChatEndLine>;
    case "failed":
    case "engine-stopped": {
      const cause =
        end.kind === "failed" ? tryItWords.replyFailed(name, end.reason) : tryItWords.engineStopped;
      return end.toolsRan ? (
        <ChatEndLine tone="danger">{`${cause} ${tryItWords.toolsRan}`}</ChatEndLine>
      ) : (
        <ChatEndLine tone="danger" actions={again}>
          {cause}
        </ChatEndLine>
      );
    }
  }
}
