import type { SandboxStartCheck } from "@halonicjs/app";
import { findSecretShape } from "@halonicjs/std";
import { SandboxCantRunCallout, useSandboxStart } from "@halonicjs/studio-feature-runs/api";
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
import { Fragment, type ReactNode, useId, useRef, useState } from "react";
import type { AgentHarnessId } from "../api.ts";
import type { HarnessStrip } from "../configuration/harness-strip.ts";
import { type BoxLineActions, boxProblem, makesSendWait, TryItBoxLine } from "./box-line.tsx";
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
  /** The agent's harness, and the strip its check calls for, or `null` when it can run. */
  readonly harness: AgentHarnessId;
  readonly harnessStrip: HarnessStrip | null;
  /** The ways to the places the line under the box points to. */
  readonly ways: Pick<BoxLineActions, "goToKeyField" | "openHarness">;
  /**
   * Checks whether the sandbox can start, for an agent whose harness is a program; where it is
   * absent, Send never waits for the sandbox (the engine still refuses such a reply).
   */
  readonly sandboxStartCheck?: SandboxStartCheck | undefined;
  /** Reads a sentence out through the shell's announcer, for the sandbox's **Check again**. */
  readonly announce?: ((text: string) => void) | undefined;
}

/**
 * An agent's Try it chat (flow-agents 4): the empty draft (H2), or the transcript with each reply
 * built step by step and the line it ended with, then the box. Try it is not a run in v0.1, so a
 * reply has no run line and a failure no run link (HAL-915).
 */
export function TryItChatView(props: TryItChatViewProps) {
  const { chat, name, description, figure } = props;
  const [draft, setDraft] = useState("");
  // A message that looks like it holds a key stays in the box until it changes (H29).
  const [heldForKey, setHeldForKey] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const lineId = useId();
  const noticeId = useId();
  const { turns } = chat.transcript;
  // Halonic's own loop starts no program, so only Claude Code and Codex need the sandbox.
  const sandbox = useSandboxStart(props.sandboxStartCheck, props.harness !== "halonic");
  const problem = boxProblem({
    heldForKey,
    harness: props.harness,
    strip: props.harnessStrip,
    sandboxRefused: sandbox.refused !== undefined,
  });

  const sendNow = (message = draft) => {
    chat.send(message, refused);
    setDraft("");
    setHeldForKey(false);
  };
  // The engine found the workspace isn't trusted: the message goes back in the box, unless the
  // person already wrote another, and the trust gate opens; once trusted, it's sent (H16).
  const refused = (message: string) => {
    setDraft((current) => (current === "" ? message : current));
    void chat.askTrust().then((trusted) => {
      if (!trusted) return;
      chat.send(message, refused);
      setDraft((current) => (current === message ? "" : current));
    });
  };
  // Send anyway skips only the key check: a quiet engine or a workspace that isn't trusted holds
  // it as it holds Send.
  const send = async ({ keyChecked = false } = {}) => {
    if (chat.engineQuiet) return;
    if (!keyChecked && findSecretShape(draft) !== undefined) {
      setHeldForKey(true);
      return;
    }
    // A workspace that isn't trusted keeps the message in the box (H16).
    if (await chat.mayStart()) sendNow();
  };
  const edit = (text: string) => {
    setDraft(text);
    setHeldForKey(false);
  };
  // Try again puts focus in the box, as New chat does (a11y 6.2).
  const tryAgain = () => {
    chat.tryAgain(refused);
    box.current?.focus();
  };
  // Send anyway takes its line away, so focus goes to the box rather than the page (C505-3).
  const sendAnyway = () => {
    box.current?.focus();
    void send({ keyChecked: true });
  };

  const line = () => {
    if (problem === undefined) return undefined;
    // The same Callout as Run, under the box; once the sandbox works, the box takes focus.
    if (problem.kind === "sandbox") {
      return (
        <SandboxCantRunCallout
          name={name}
          start={sandbox}
          firstLineId={lineId}
          announce={props.announce}
          onReady={() => box.current?.focus()}
        />
      );
    }
    return (
      <div id={lineId}>
        <TryItBoxLine problem={problem} name={name} actions={{ ...props.ways, sendAnyway }} />
      </div>
    );
  };

  // While the engine isn't answering, Send waits with the transcript's line as its reason (H12).
  // A program or a sandbox that isn't ready makes it wait with the line under the box (H27,
  // HAL-4291).
  const sendWait = () => {
    if (chat.engineQuiet) return { reason: noticeId };
    if (makesSendWait(problem)) return { reason: lineId };
    return undefined;
  };

  return (
    <div className="flex size-full min-h-0 flex-col">
      {turns.length === 0 ? (
        <ChatStart figure={figure} heading={tryItWords.heading(name)} description={description} />
      ) : (
        <ChatTranscript
          label={tryItWords.transcript(name)}
          notice={chat.engineQuiet ? tryItWords.engineNotAnswering : undefined}
          noticeId={noticeId}
        >
          {turns.map((turn, index) => (
            // Turns are only added or taken back at the end, so their place is their key.
            <Fragment key={index}>
              <ChatMessage from="you">{turn.message}</ChatMessage>
              <Reply
                turn={turn}
                name={name}
                // Try again waits until the engine answers again (H13).
                tryAgain={index === turns.length - 1 && !chat.engineQuiet ? tryAgain : undefined}
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
          onChange={edit}
          onSend={() => void send()}
          onStop={chat.stop}
          answering={chat.answering}
          sendUnavailable={sendWait()}
          textRef={box}
          line={line()}
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
    case "engine-stopped":
      return (
        <ChatEndLine tone="danger" actions={end.toolsRan ? [] : again}>
          {tryItWords.endedBadly(name, end)}
        </ChatEndLine>
      );
  }
}
