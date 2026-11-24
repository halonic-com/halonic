import {
  Button,
  type ButtonUnavailable,
  type ChatAction,
  ChatEndLine,
  ChatLoading,
  ChatMessage,
  ChatText,
  ChatToolLine,
  ChatTranscript,
  EmptyState,
  SidePanel,
  usePresentation,
} from "@halonicjs/studio-kit";
import {
  engineWords,
  engineWordsOf,
  type ItemRef,
  type PanelWindowViewProps,
  type WorkspaceContext,
} from "@halonicjs/studio-shell";
import {
  Fragment,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AssistantHostService, type ChatAgent } from "../api.ts";
import { ProposalCard } from "../cards/proposal-card.tsx";
import { toolInWords, buildChatWords as words } from "../chat/build-chat-words.ts";
import {
  type Announce,
  type BuildChats,
  buildChatsOf,
  type ChatView,
  type Shown,
} from "../chat/build-chats.ts";
import { chatWithWords as agentWords } from "../chat/chat-with-words.ts";
import { endLine, type ReplyStep, runningLine, type Turn, turnsOf } from "../chat/turns.ts";
import { AgentStatusLine, PanelChatStart } from "./agent-chat.tsx";
import { BuildComposer } from "./build-composer.tsx";
import {
  agentOf,
  ChatChips,
  type ChatChoices,
  type ReadChoices,
  useChatChoices,
} from "./chat-choices.tsx";
import { ChatHeading, DesktopActions } from "./chat-header.tsx";
import { openModelsCommand, useModelBox } from "./model-line.tsx";
import { PhoneChatMenu, PhoneHeading } from "./phone-header.tsx";
import { PhoneSheets, usePhoneChat } from "./phone-sheets.tsx";
import { StripAboveBox } from "./review-strip.tsx";
import { useAuthoringOnly, useEngineAnswering, useTrustCheck } from "./send-gate.ts";
import { ShownItems } from "./shown-items.tsx";
import { SkillLink } from "./skill-link.tsx";

/** Focus as it is: the panel "moves" focus to what has it, so Show in chat leaves it there. */
const focusAsItIs: RefObject<HTMLElement | null> = {
  get current() {
    const focused = document.activeElement;
    return focused instanceof HTMLElement ? focused : document.body;
  },
};

/**
 * The Assistant's side panel (flow-assistant 2.2): the header with the chat's title, **New chat**
 * and ✕, the status line, and the Build chat. It opens on the chat it showed last, else the most
 * recently used one, else a new Build chat, with focus in the box, or where it was when Show in
 * chat opened it (flow-assistant 2.2). The region is named "Assistant" whatever the chat's title
 * is (L12). On a phone it's the full-page chat (flow-assistant 11.3): "Assistant" with the status
 * line in the top bar, a ⋮ with the phone's sheets, and the focus on the title.
 */
export function AssistantPanel({ context, title, onClose }: PanelWindowViewProps) {
  const host = context.services.get(AssistantHostService);
  const chats = buildChatsOf(host);
  const shown = useSyncExternalStore(chats.subscribe, chats.shown);
  const choices = useChatChoices(host, shown.kind === "chat" ? shown.view.chat.id : undefined);
  const lookingAt = useShownTitle(context);
  const box = useRef<HTMLTextAreaElement>(null);
  const [keepFocus] = useState(() => chats.takeKeepFocus());
  const newChatButton = useRef<HTMLButtonElement>(null);
  const [renaming, setRenaming] = useState(false);
  const announce = useCallback<Announce>(
    (text, politeness) => context.announcer.announce(text, politeness),
    [context],
  );
  useEffect(() => {
    void chats.open();
  }, [chats]);

  const phone = usePhoneChat();
  // New chat focuses the box (flow 2.2), on a phone the title (11.3); the empty panel's box too.
  const newChat = () =>
    void chats.newChat().then(phone.on ? phone.focusTitle : () => box.current?.focus());
  const view = shown.kind === "chat" ? shown.view : undefined;
  const heading = view === undefined || view.chat.draft ? title : view.chat.title;
  const header = { host, chats, view, title, box, onNewChat: newChat, agents: choices.agents };

  const panel = (
    <SidePanel
      title={phone.on ? title : heading}
      heading={
        phone.on ? (
          <PhoneHeading title={title} view={view} lookingAt={lookingAt} anchor={phone.anchor} />
        ) : (
          <ChatHeading {...header} renaming={renaming} onRenamed={() => setRenaming(false)} />
        )
      }
      label={title}
      halo
      initialFocus={keepFocus ? focusAsItIs : box}
      onClose={onClose}
      actions={
        phone.on ? (
          <PhoneChatMenu
            {...header}
            onRecentChats={() => phone.open("recent-chats")}
            onRename={() => phone.open("rename")}
            afterDelete={() => newChatButton.current}
          />
        ) : (
          <DesktopActions
            {...header}
            onRename={() => setRenaming(true)}
            afterDelete={() => newChatButton.current}
            onClose={onClose}
          />
        )
      }
    >
      {/* The transcript and the box reach the panel's edges; the transcript scrolls by itself. */}
      <div className="-mx-4 -my-3 flex h-[calc(100%+1.5rem)] flex-col">
        <PanelBody
          context={context}
          shown={shown}
          chats={chats}
          box={box}
          announce={announce}
          onNewChat={newChat}
          newChatButton={newChatButton}
          lookingAt={lookingAt}
          skillLink={(view: ChatView) =>
            // No customize skill on a phone: it opens the file editor (flow-assistant 11.2).
            view.chat.kind === "build" && !phone.on ? (
              <SkillLink host={host} context={context} freshness={view.messages} />
            ) : null
          }
          onOpenItem={(item) => context.openItem?.(item)}
          choices={choices}
        />
      </div>
    </SidePanel>
  );
  return <PhoneSheets {...header} phone={phone} panel={panel} />;
}

interface PanelBodyProps {
  readonly context: WorkspaceContext;
  readonly shown: Shown;
  readonly chats: BuildChats;
  readonly box: RefObject<HTMLTextAreaElement | null>;
  readonly announce: Announce;
  readonly onNewChat: () => void;
  /** The empty panel's New chat, which takes focus after Delete chat. */
  readonly newChatButton: RefObject<HTMLButtonElement | null>;
  /** The page the window shows, as its tab names it; none in a window without tabs. */
  readonly lookingAt: string | undefined;
  /** The link under the box for a chat: "customize skill" or "edit skill" in a Build chat. */
  readonly skillLink: (view: ChatView) => ReactNode;
  readonly onOpenItem: (item: ItemRef) => void;
  readonly choices: ReadChoices;
}

/**
 * The chat, its first load (H7), a chat that can't load, or no chat (H3). While the engine doesn't
 * answer, the chat says so at the top, in the window's words (H12, H15), and Send, Try again and
 * Continue wait with that line as their reason (D5). The chat's model may put its line under the
 * box (H18 to H20). A message the host refused because the workspace isn't trusted opens the trust
 * check (H16).
 */
function PanelBody(props: PanelBodyProps) {
  const { context, shown, chats, box, announce, onNewChat, lookingAt, skillLink, choices } = props;
  const host = context.services.get(AssistantHostService);
  const runCommand = context.runCommand;
  const engineAnswering = useEngineAnswering(host);
  const askTrust = useTrustCheck(host);
  const authoringOnly = useAuthoringOnly(host, chatIdOf(shown));
  const noticeId = useId();
  const view = shown.kind === "chat" ? shown.view : undefined;
  const modelBox = useModelBox(view?.chat, choices, context, box);
  const send = (message: string | undefined, putBack: (message: string) => void) =>
    void chats.send(message, announce, () => {
      void askTrust(
        () => send(message, putBack),
        () => {
          if (message !== undefined) putBack(message);
        },
      );
    });
  if (shown.kind === "none") return <NoChat onNewChat={onNewChat} button={props.newChatButton} />;
  if (shown.kind === "failed") {
    return (
      <EmptyState
        tone="error"
        align="start"
        title={words.cantLoad}
        description={shown.reason}
        action={{ label: words.tryAgain, onClick: () => void chats.open() }}
      />
    );
  }
  const agent = view === undefined ? undefined : agentOf(view.chat, choices);
  return (
    <>
      <StatusLine view={view} agent={agent} lookingAt={lookingAt} />
      <ShownItems
        shown={view?.shown ?? []}
        onOpen={props.onOpenItem}
        onRemove={(item) => chats.removeShown(item)}
      />
      {view === undefined ? (
        // Fills the transcript's place, so the box is at the bottom from the start (H7).
        <div className="flex min-h-0 flex-1 flex-col">
          <ChatLoading label={words.loading} onRetry={() => void chats.open()} />
        </div>
      ) : (
        <Transcript
          view={view}
          context={context}
          agent={agent}
          notice={engineAnswering ? undefined : notAnsweringLine(context)}
          noticeId={noticeId}
          onContinue={() => send(undefined, () => {})}
          continueWaits={engineAnswering ? undefined : { reason: noticeId }}
        />
      )}
      <StripAboveBox view={view} host={host} box={box} announce={announce} />
      <ChipsAboveBox view={view} chats={chats} choices={choices} box={box} announce={announce} />
      <BuildComposer
        {...agentBox(agent)}
        answering={view?.answering === true}
        box={box}
        onSend={(message, putBack) => {
          if (view === undefined || !engineAnswering) return false;
          send(message, putBack);
          return true;
        }}
        onStop={() => chats.stop()}
        sendUnavailable={sendWait(
          view === undefined,
          engineAnswering ? modelBox.waitsOn : noticeId,
        )}
        line={modelBox.line}
        onSendHeld={engineAnswering ? modelBox.onSendHeld : undefined}
        onGoToKeyField={runCommand && (() => void runCommand(openModelsCommand))}
        authoringOnly={authoringOnly}
        onReviewTrust={host.askTrust && (() => void host.askTrust?.())}
      />
      {view === undefined ? null : skillLink(view)}
    </>
  );
}

/** The Model and Chat with chips above the box, once the chat has loaded. */
function ChipsAboveBox(props: {
  readonly view: ChatView | undefined;
  readonly chats: BuildChats;
  readonly choices: ChatChoices;
  readonly box: PanelBodyProps["box"];
  readonly announce: Announce;
}) {
  const { view, chats, box, announce } = props;
  if (view === undefined) return null;
  return (
    <ChatChips
      chat={view.chat}
      choices={props.choices}
      onChatWith={(kind) => void chats.chatWith(kind).then(() => box.current?.focus())}
      onModel={(model) => void chats.setModel(model, announce)}
    />
  );
}

/** The id of the chat the panel shows, once it has loaded. */
function chatIdOf(shown: Shown): string | undefined {
  return shown.kind === "chat" ? shown.view.chat.id : undefined;
}

/** Send waits on the line it names, except while there is no chat to send in. */
function sendWait(loading: boolean, reason: string | undefined): ButtonUnavailable | undefined {
  return loading || reason === undefined ? undefined : { reason };
}

/**
 * The line at the top while the engine doesn't answer: the desktop app's says it shows what it
 * said last (H12); a served Studio's and a phone's say the reply carries on there (H15).
 */
function notAnsweringLine(context: WorkspaceContext): string {
  const own = engineWordsOf(context);
  if (own === engineWords.served) return words.serverNotAnswering;
  if (own === engineWords.phone) return words.computerNotAnswering;
  return words.engineNotAnswering;
}

/** An agent chat's box is named for the agent: "Message Triage", with "Message Triage…". */
function agentBox(agent: ChatAgent | undefined) {
  if (agent === undefined) return {};
  return {
    label: agentWords.boxLabel(agent.name),
    placeholder: agentWords.placeholder(agent.name),
  };
}

/**
 * No chat open (H3), at the top and left-aligned like the failed and the empty chat: the panel
 * doesn't centre. The kit's `EmptyState` aligns to the start only for an error, so the panel lays
 * it out here, with the spacing of that failed state.
 */
function NoChat({
  onNewChat,
  button,
}: {
  readonly onNewChat: () => void;
  readonly button: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div className="flex flex-col items-start gap-1.5 px-4 py-3">
      <p className="text-section text-fg">{words.noChat}</p>
      <p className="text-body text-fg-muted">{words.noChatLine}</p>
      <div className="mt-1.5">
        <Button ref={button} variant="primary" size="md" onClick={onNewChat}>
          {words.newChat}
        </Button>
      </div>
    </div>
  );
}

/** The line at the top: an agent chat's orb, name and state, else the status line. */
function StatusLine(props: {
  readonly view: ChatView | undefined;
  readonly agent: ChatAgent | undefined;
  readonly lookingAt: string | undefined;
}) {
  const { view, agent } = props;
  const phone = usePresentation() === "phone";
  if (view !== undefined && agent !== undefined)
    return <AgentStatusLine agent={agent} view={view} />;
  if (phone) return null; // It's in the top bar on a phone (flow-assistant 11.3).
  return <p className="px-4 text-caption text-fg-muted">{statusLine(view, props.lookingAt)}</p>;
}

/**
 * The status line (flow-assistant 2.2): running with the tool, "Stopped by you", else the page the
 * window shows ("Looking at: Home"). Not live.
 */
function statusLine(view: ChatView | undefined, lookingAt: string | undefined): string {
  if (view?.answering === true) return runningLine(view.tool);
  if (view?.stoppedByYou === true) return words.stopped;
  return lookingAt === undefined ? "" : words.lookingAt(lookingAt);
}

const noTitle = { get: () => undefined, subscribe: () => () => {} };

/** The name of the page the window shows, following its active tab (`shell.shown-title`). */
function useShownTitle(context: WorkspaceContext): string | undefined {
  const source = context.shownTitle ?? noTitle;
  return useSyncExternalStore(source.subscribe, source.get);
}

function Transcript({
  view,
  context,
  agent,
  notice,
  noticeId,
  onContinue,
  continueWaits,
}: {
  readonly view: ChatView;
  readonly context: WorkspaceContext;
  /** The agent an agent chat talks to: its start says "Chat with Triage" and its description. */
  readonly agent: ChatAgent | undefined;
  /** The engine's line at the top while it doesn't answer (H12). */
  readonly notice: string | undefined;
  readonly noticeId: string;
  /** Continue or Try again on the last reply. */
  readonly onContinue: () => void;
  /** While the engine doesn't answer, Continue and Try again wait on its line (D5). */
  readonly continueWaits: ButtonUnavailable | undefined;
}) {
  const turns = turnsOf(view.messages, view.ends, view.answering);
  if (turns.length === 0 && notice === undefined) return <PanelChatStart agent={agent} />;
  return (
    <ChatTranscript label={words.transcript} notice={notice} noticeId={noticeId}>
      {turns.map((turn, index) => (
        // Turns are only added at the end, so their place is their key.
        <Fragment key={index}>
          <ChatMessage from="you">{turn.message}</ChatMessage>
          <Reply
            turn={turn}
            place={{ chatId: view.chat.id, context }}
            onContinue={index === turns.length - 1 ? onContinue : undefined}
            waits={continueWaits}
          />
        </Fragment>
      ))}
    </ChatTranscript>
  );
}

/** Where a reply's cards belong: their chat and the workspace. */
interface CardPlace {
  readonly chatId: string;
  readonly context: WorkspaceContext;
}

function Reply({
  turn,
  place,
  onContinue,
  waits,
}: {
  readonly turn: Turn;
  readonly place: CardPlace;
  readonly onContinue: (() => void) | undefined;
  readonly waits: ButtonUnavailable | undefined;
}) {
  const end = turn.end;
  // Only the last reply offers Continue or Try again: each carries on that answer without a new
  // message (flow-assistant 3.6), which sends the last message again when nothing ran (H13, H22,
  // H23). After a tool ran there is no Try again, since a tool may have sent something (H24).
  const actions = onContinue === undefined ? [] : endActions(end, onContinue, waits);
  return (
    <ChatMessage from="reply" heading={words.said}>
      {turn.steps.map((step, index) => (
        // Steps are only added at the end, so their place is their key.
        <Step key={index} step={step} place={place} />
      ))}
      {end === undefined ? null : (
        <ChatEndLine tone={end.kind === "failed" ? "danger" : "plain"} actions={actions}>
          {endLine(end)}
        </ChatEndLine>
      )}
    </ChatMessage>
  );
}

function endActions(
  end: Turn["end"],
  onContinue: () => void,
  unavailable: ButtonUnavailable | undefined,
): ChatAction[] {
  if (end?.kind === "model-call-limit") {
    return [{ label: words.continue, onClick: onContinue, unavailable }];
  }
  if ((end?.kind === "engine-stopped" || end?.kind === "failed") && !end.toolsRan) {
    return [{ label: words.tryAgain, onClick: onContinue, unavailable }];
  }
  return [];
}

function Step({ step, place }: { readonly step: ReplyStep; readonly place: CardPlace }) {
  if (step.kind === "text") return <ChatText>{step.text}</ChatText>;
  if (step.kind === "proposal") {
    const { callId, path, content, why } = step;
    const proposal = { chatId: place.chatId, callId, path, content };
    return <ProposalCard proposal={proposal} why={why} context={place.context} />;
  }
  return (
    <ChatToolLine state={step.state}>{words.tool[step.state](toolInWords(step.name))}</ChatToolLine>
  );
}
