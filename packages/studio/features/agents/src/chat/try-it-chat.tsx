import type { SandboxStartCheck } from "@halonicjs/app";
import type { ChatComponentName } from "@halonicjs/openui-lang";
import {
  cantRunWords,
  SandboxCantRunCallout,
  useSandboxStart,
} from "@halonicjs/studio-feature-runs/api";
import {
  type ChatAction,
  ChatComposer,
  ChatEndLine,
  ChatMessage,
  ChatStart,
  ChatToolLine,
  ChatTranscript,
} from "@halonicjs/studio-kit";
import {
  type ChatSecretHold,
  chatSecretHold,
  copyDetailsWords,
  useCopyDetails,
} from "@halonicjs/studio-shell";
import { Fragment, type ReactNode, useEffect, useId, useRef, useState } from "react";
import type { AgentHarnessId } from "../api.ts";
import type { HarnessStrip } from "../configuration/harness-strip.ts";
import { type BoxLineActions, boxProblem, makesSendWait, TryItBoxLine } from "./box-line.tsx";
import { ReplyText, type ReplyUi } from "./reply-ui.tsx";
import { type ChatTurn, type ReplyEnd, type ReplyStep, shownSteps } from "./transcript.ts";
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
  /** The components the agent's `chatUi` lets it draw in its replies; absent when it's off. */
  readonly chatUi?: readonly ChatComponentName[] | undefined;
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
  const [held, setHeld] = useState<ChatSecretHold | undefined>(undefined);
  const box = useRef<HTMLTextAreaElement>(null);
  const lineId = useId();
  const noticeId = useId();
  const { turns } = chat.transcript;
  // Halonic's own loop starts no program, so only Claude Code and Codex need the sandbox.
  const sandbox = useSandboxStart(props.sandboxStartCheck, props.harness !== "halonic");
  const problem = boxProblem({
    held,
    harness: props.harness,
    strip: props.harnessStrip,
    sandboxRefused: sandbox.refused !== undefined,
  });

  const sendNow = (message: string, { fromBox = true } = {}) => {
    chat.send(message, refused);
    if (!fromBox) return;
    setDraft("");
    setHeld(undefined);
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
    const hold = keyChecked ? undefined : chatSecretHold(draft);
    if (hold !== undefined) {
      setHeld(hold);
      return;
    }
    // A workspace that isn't trusted keeps the message in the box (H16).
    if (await chat.mayStart()) sendNow(draft);
  };
  // A reply's button or form sends its words as if they were typed: the key check and trust hold
  // them as they hold Send, and a message that looks like it holds a key waits in the box (H29).
  const sendFromReply = async (message: string) => {
    if (chat.engineQuiet || chat.answering) return;
    const hold = chatSecretHold(message);
    if (hold !== undefined) {
      setDraft(message);
      setHeld(hold);
      return;
    }
    if (await chat.mayStart()) sendNow(message, { fromBox: false });
    // Not trusted: the words wait in an empty box, as a typed message does (H16).
    else setDraft((current) => (current === "" ? message : current));
  };
  // Only the newest reply's controls work, once it ended; older ones show what was sent after them.
  const replyUi = (index: number): ReplyUi | undefined => {
    if (props.chatUi === undefined) return undefined;
    const newest = index === turns.length - 1;
    const ended = turns[index]?.end !== undefined;
    const live = newest && ended && !chat.answering && !chat.engineQuiet;
    return {
      components: props.chatUi,
      sender: name,
      onSend: live ? (message) => void sendFromReply(message) : undefined,
      answered: turns[index + 1]?.message,
      ended,
    };
  };
  const edit = (text: string) => {
    setDraft(text);
    setHeld(undefined);
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

  const sandboxRefused = problem?.kind === "sandbox";
  // The Callout stays out of the box's status region, so its buttons aren't read with it; only its
  // first line is read, once, when it shows (C516 S-5).
  const announce = props.announce;
  useEffect(() => {
    if (sandboxRefused) announce?.(cantRunWords.cantRun(name));
  }, [sandboxRefused, announce, name]);
  const line = () => {
    if (problem === undefined || problem.kind === "sandbox") return undefined;
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
                ui={replyUi(index)}
                openModels={props.ways.goToKeyField}
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
        {/* The same Callout as Run, under the box; once the sandbox works, the box takes focus. */}
        {sandboxRefused ? (
          <SandboxCantRunCallout
            name={name}
            start={sandbox}
            firstLineId={lineId}
            announce={announce}
            onReady={() => box.current?.focus()}
          />
        ) : null}
      </div>
    </div>
  );
}

function Reply({
  turn,
  name,
  ui,
  openModels,
  tryAgain,
}: {
  readonly turn: ChatTurn;
  readonly name: string;
  readonly ui: ReplyUi | undefined;
  /** Opens Models, where keys are kept, for a failure because of the model's key. */
  readonly openModels: () => void;
  /** Only the last reply offers Try again: it sends its message again. */
  readonly tryAgain: (() => void) | undefined;
}) {
  return (
    <ChatMessage from="reply" heading={tryItWords.said(name)} busy={turn.end === undefined}>
      {shownSteps(turn).map((step, index) => (
        // Steps are only added at the end, so their place is their key.
        <Step key={index} step={step} ui={ui} />
      ))}
      {turn.end === undefined ? null : (
        <EndLine end={turn.end} name={name} openModels={openModels} tryAgain={tryAgain} />
      )}
    </ChatMessage>
  );
}

function Step({ step, ui }: { readonly step: ReplyStep; readonly ui: ReplyUi | undefined }) {
  if (step.kind === "text") return <ReplyText text={step.text} {...(ui && { ui })} />;
  const tool = toolInWords(step.name);
  return <ChatToolLine state={step.state}>{tryItWords.tool[step.state](tool)}</ChatToolLine>;
}

/**
 * The line a reply ends with (mc 8.3; states H13, H23, H24). Try again only when no tool ran,
 * since sending again could repeat what a tool did; after a tool, the sentence says to send a new
 * message instead. A failure because of the model's key also leads to Models, as a failed run
 * does (microcopy 15.3), and comes first: until the key is fixed, Try again fails the same way
 * (microcopy 1.6 E2). A failure Halonic can't explain offers Copy details instead of Try again,
 * since trying again won't explain it (microcopy 22 F13, C665-104). A reply that was simply
 * answered has no line.
 */
function EndLine({
  end,
  name,
  openModels,
  tryAgain,
}: {
  readonly end: ReplyEnd;
  readonly name: string;
  readonly openModels: () => void;
  readonly tryAgain: (() => void) | undefined;
}) {
  const copy = useCopyDetails();
  const details = end.kind === "failed" ? end.details : undefined;
  let again: ChatAction[] = [];
  if (details !== undefined) {
    again = [{ label: copyDetailsWords.label, onClick: () => void copy(details) }];
  } else if (tryAgain !== undefined && !("toolsRan" in end && end.toolsRan)) {
    again = [{ label: tryItWords.tryAgain, onClick: tryAgain }];
  }
  const fixKey: ChatAction[] =
    end.kind === "failed" && end.needsKey === true
      ? [{ label: tryItWords.openModels, onClick: openModels, look: "link" }]
      : [];
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
        <ChatEndLine tone="danger" actions={[...fixKey, ...again]}>
          {tryItWords.endedBadly(name, end)}
        </ChatEndLine>
      );
  }
}
