import {
  BackIcon,
  Button,
  Callout,
  ChatEndLine,
  ChatMessage,
  ChatToolLine,
  ChatTranscript,
  HandIcon,
  InfoIcon,
} from "@halonicjs/studio-kit";
import { type ReactNode, useEffect, useRef } from "react";
import { hostShown, hostTitle, hostTitleParts } from "./host-text.ts";
import { HostTextView } from "./host-text-view.tsx";
import { PromptBox } from "./prompt-box.tsx";
import type { RemoteSendOutcome, RemoteView } from "./remote-view.ts";
import { type RunItem, runHistory } from "./run-history.ts";
import { runWords } from "./run-words.ts";
import { ANSWER_RISKY_ON_COMPUTER } from "./view-of.ts";

export interface RunDetailProps {
  readonly view: RemoteView;
  /** The agent in view: one of `view.sessions`. */
  readonly sessionId: string;
  /** The connection label (`PhoneStatusHeader`), as on the computer's other screens. */
  readonly label: ReactNode;
  /** The stale banner (`StaleBanner`) while the view is stale; nothing while it's live. */
  readonly banner?: ReactNode;
  /**
   * Back, Android's back, and an agent that left the computer's list while open: back to Agents.
   */
  readonly onBack: () => void;
  /** `PhoneRemote.prompt`. */
  readonly onSend: (sessionId: string, text: string) => Promise<RemoteSendOutcome>;
  readonly now?: () => Date;
}

/**
 * The phone's run detail (drawing on HAL-16169): Back, the agent's name and the connection label;
 * the stale banner above the history, so it never scrolls out of sight; the agent's messages and
 * approvals with the computer's times; and the prompt box, sending to this agent. A waiting
 * approval says "Answer this on your computer." and has no Approve or Reject (I2). Only the
 * prompt box and the label say anything out loud: a new message isn't read as it arrives.
 */
export function RunDetail({
  view,
  sessionId,
  label,
  banner,
  onBack,
  onSend,
  now = () => new Date(),
}: RunDetailProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const session = view.sessions.find((each) => each.id === sessionId);
  const gone = session === undefined;

  // Focus goes to the heading when the screen opens, as on the other phone screens.
  useEffect(() => heading.current?.focus(), []);
  useEffect(() => {
    if (gone) onBack();
  }, [gone, onBack]);

  if (session === undefined) return null;
  const title = hostTitle(session.title);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-phone-bar shrink-0 items-center gap-1 border-b border-border pr-4 pl-1">
        <Button
          variant="ghost"
          size="touch"
          icon={<BackIcon />}
          label={runWords.back}
          onClick={onBack}
        />
        <h1
          ref={heading}
          tabIndex={-1}
          className="min-w-24 flex-1 truncate rounded-sm text-heading text-fg focus-ring"
        >
          <HostTextView text={hostTitleParts(session.title)} />
        </h1>
        {/* The title wins: it keeps at least 96px, and the label shrinks, cutting the computer's
            name with "…" while its dot, state words and chevron stay (HAL-16957). */}
        <div className="min-w-0">{label}</div>
      </header>
      {view.canAnswer || banner === undefined ? null : (
        <div className="shrink-0 px-4 pt-3">{banner}</div>
      )}
      <ChatTranscript label={runWords.history(title)}>
        {runHistory(view, session, now()).map((item) => (
          <RunItemView key={item.key} item={item} agent={title} />
        ))}
      </ChatTranscript>
      <PromptBox
        key={sessionId}
        view={view}
        agent={{ sessionId, title: session.title }}
        onSend={onSend}
      />
    </div>
  );
}

function RunItemView({ item, agent }: { readonly item: RunItem; readonly agent: string }) {
  switch (item.kind) {
    case "dropped":
      return (
        <p className="flex items-start gap-2 text-small text-fg-muted">
          <span aria-hidden="true" className="mt-0.5 inline-grid size-icon-sm shrink-0 *:size-full">
            <InfoIcon />
          </span>
          {runWords.droppedOlder}
        </p>
      );
    case "nothing":
      return <p className="text-small text-fg-muted">{runWords.nothingYet(agent)}</p>;
    case "message":
      return (
        <div className="flex flex-col gap-1">
          {item.from === "you" ? (
            <ChatMessage from="you">{hostShown(item.text)}</ChatMessage>
          ) : (
            <ChatMessage from="reply" heading={runWords.said(agent)} headingLevel={2}>
              {/* `ChatText`'s look, with the hidden characters drawn as chips. */}
              <p className="text-reading text-fg whitespace-pre-wrap wrap-break-word">
                <HostTextView text={item.text} />
              </p>
            </ChatMessage>
          )}
          {item.time === undefined ? null : (
            <p className={`text-caption text-fg-muted ${item.from === "you" ? "text-right" : ""}`}>
              {item.time}
            </p>
          )}
        </div>
      );
    case "waiting":
      return (
        <Callout tone="warning" icon={<HandIcon />} title={runWords.waiting(agent)}>
          <div className="flex flex-col gap-1">
            {/* The tool and its arguments as the computer sends them: it wraps at a space first,
                and inside a long token only when it must, so nothing runs off the screen. */}
            <p className="font-mono text-code wrap-anywhere">
              <HostTextView text={item.summary} />
            </p>
            {item.time === undefined ? null : <p className="text-fg-muted">{item.time}</p>}
            <p>{ANSWER_RISKY_ON_COMPUTER}</p>
          </div>
        </Callout>
      );
    case "answered":
      return item.decision === "approve" ? (
        <ChatToolLine state="done">{item.text}</ChatToolLine>
      ) : (
        <ChatEndLine tone="plain">{item.text}</ChatEndLine>
      );
    case "working":
      return <ChatToolLine state="running">{item.text}</ChatToolLine>;
    case "ended":
      return <ChatEndLine tone={item.tone}>{item.text}</ChatEndLine>;
  }
}
