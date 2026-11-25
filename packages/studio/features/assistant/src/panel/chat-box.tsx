import type { ButtonUnavailable } from "@halonicjs/studio-kit";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import type { RefObject } from "react";
import type { AssistantHost, ChatAgent, ChatKind } from "../api.ts";
import type { Announce, BuildChats, ChatView } from "../chat/build-chats.ts";
import { chatWithWords as agentWords } from "../chat/chat-with-words.ts";
import { BuildComposer } from "./build-composer.tsx";
import { agentOf, ChatChips, type ReadChoices } from "./chat-choices.tsx";
import { openModelsCommand, useModelBox } from "./model-line.tsx";
import { StripAboveBox } from "./review-strip.tsx";
import { useAuthoringOnly, useTrustCheck } from "./send-gate.ts";

/** A message, or none to continue, the person sends; put back when they don't trust the workspace. */
export type Send = (
  chatId: string,
  message: string | undefined,
  putBack: (message: string) => void,
) => void;

/**
 * Sends in a chat. A message the host refused because the workspace isn't trusted opens the trust
 * check: trusting sends it again, Not now puts it back in the box (H16). The model's `show` tool
 * shows items with the window's `showItem` (`assistant.build.show-tool`).
 */
export function useSend(
  chats: BuildChats,
  announce: Announce,
  host: AssistantHost,
  context: WorkspaceContext,
): Send {
  const askTrust = useTrustCheck(host);
  const send: Send = (chatId, message, putBack) =>
    void chats.send(chatId, message, announce, {
      refused: () => {
        void askTrust(
          () => send(chatId, message, putBack),
          () => {
            if (message !== undefined) putBack(message);
          },
        );
      },
      showItem: context.showItem,
    });
  return send;
}

/**
 * The chat's box. Send waits while the engine doesn't answer, pointing at its line (`waitsOn`);
 * otherwise the chat's model may put its line under the box and hold or wait Send (H18 to H20).
 */
export function ChatBox(props: {
  readonly view: ChatView | undefined;
  readonly chats: BuildChats;
  readonly box: RefObject<HTMLTextAreaElement | null>;
  readonly send: Send;
  readonly waitsOn: string | undefined;
  readonly context: WorkspaceContext;
  readonly glow: boolean | undefined;
  /** Says whether the chat answers with the authoring tools only, before trust (H17). */
  readonly host: AssistantHost;
  readonly choices: ReadChoices;
  readonly onChatWith: (kind: ChatKind) => void;
  readonly announce: Announce;
}) {
  const { view, chats, waitsOn, host } = props;
  const runCommand = props.context.runCommand;
  const modelBox = useModelBox(view?.chat, props.choices, props.context, props.box);
  const authoringOnly = useAuthoringOnly(host, view?.chat.id);
  const agent = view === undefined ? undefined : agentOf(view.chat, props.choices);
  // The Model and Chat with chips sit above the box, and under it on the start screen (6.1).
  const chips =
    view === undefined ? null : (
      <ChatChips
        chat={view.chat}
        choices={props.choices}
        onChatWith={props.onChatWith}
        onModel={(model) => void chats.setModel(view.chat.id, model, props.announce)}
      />
    );
  return (
    <>
      <StripAboveBox view={view} host={host} box={props.box} announce={props.announce} />
      {props.glow === true ? null : chips}
      <BuildComposer
        {...boxWords(agent, view?.placeholder)}
        answering={view?.answering === true}
        box={props.box}
        onSend={(message, putBack) => {
          if (view === undefined || waitsOn !== undefined) return false;
          props.send(view.chat.id, message, putBack);
          return true;
        }}
        onStop={() => view !== undefined && chats.stop(view.chat.id)}
        sendUnavailable={sendWait(view === undefined, waitsOn ?? modelBox.waitsOn)}
        line={modelBox.line}
        onSendHeld={waitsOn === undefined ? modelBox.onSendHeld : undefined}
        onGoToKeyField={runCommand && (() => void runCommand(openModelsCommand))}
        glow={props.glow}
        request={view?.boxRequest}
        onRequestDone={view && (() => chats.clearBoxRequest(view.chat.id))}
        authoringOnly={authoringOnly}
        onReviewTrust={host.askTrust && (() => void host.askTrust?.())}
      />
      {props.glow === true ? chips : null}
    </>
  );
}

/** Send waits on the line it names, except while there is no chat to send in. */
function sendWait(loading: boolean, reason: string | undefined): ButtonUnavailable | undefined {
  return loading || reason === undefined ? undefined : { reason };
}

/**
 * An agent chat's box is named for the agent: "Message Triage", with "Message Triage…". A Build
 * chat's box keeps its own words, unless the chat was given a placeholder.
 */
function boxWords(agent: ChatAgent | undefined, placeholder: string | undefined) {
  if (agent === undefined) return placeholder === undefined ? {} : { placeholder };
  return {
    label: agentWords.boxLabel(agent.name),
    placeholder: agentWords.placeholder(agent.name),
  };
}
