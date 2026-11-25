import {
  Button,
  type ButtonUnavailable,
  ChatLoading,
  ChatMessage,
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
import { AssistantHostService, type ChatAgent, type ChatKind } from "../api.ts";
import { buildChatWords as words } from "../chat/build-chat-words.ts";
import {
  type Announce,
  type BuildChats,
  buildChatsOf,
  type ChatView,
  type Shown,
} from "../chat/build-chats.ts";
import { chatTabItem } from "../chat/chat-tab-item.ts";
import { runningLine, turnsOf } from "../chat/turns.ts";
import { AgentStatusLine, PanelChatStart } from "./agent-chat.tsx";
import { ChatBox, useSend } from "./chat-box.tsx";
import { agentOf, type ChatChoices, type ReadChoices, useChatChoices } from "./chat-choices.tsx";
import { ChatHeading, DesktopActions } from "./chat-header.tsx";
import { PhoneChatMenu, PhoneHeading } from "./phone-header.tsx";
import { PhoneSheets, usePhoneChat } from "./phone-sheets.tsx";
import { Reply } from "./reply.tsx";
import { useEngineAnswering } from "./send-gate.ts";
import { ShownItems } from "./shown-items.tsx";
import { SkillLink } from "./skill-link.tsx";
import { StartScreen, useFocusAfterStart } from "./start-screen.tsx";

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
  const openTab = (chatId: string) => context.openItem?.(chatTabItem(chatId));
  const header = {
    host,
    chats,
    view,
    title,
    box,
    onNewChat: newChat,
    onOpenTab: openTab,
    agents: choices.agents,
  };
  // Open as tab moves the chat to its tab and closes the panel: one chat in one place (2.3).
  const openAsTab =
    view === undefined || context.openItem === undefined || context.host === "phone"
      ? undefined
      : () => {
          chats.moveToTab(view.chat.id);
          openTab(view.chat.id);
          onClose();
        };

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
            onOpenAsTab={openAsTab}
            onRename={() => setRenaming(true)}
            afterDelete={() => newChatButton.current}
            onClose={onClose}
          />
        )
      }
    >
      {/* The transcript and the box reach the panel's edges; the transcript scrolls by itself. */}
      <div className="-mx-4 -my-3 flex h-[calc(100%+1.5rem)] flex-col">
        <ChatBody
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
          onChatWith={(kind) => void chats.chatWith(kind).then(() => box.current?.focus())}
        />
      </div>
    </SidePanel>
  );
  return <PhoneSheets {...header} phone={phone} panel={panel} />;
}

/** The props of {@link ChatBody}. */
export interface ChatBodyProps {
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
  /** The models and agents the Model and Chat with chips offer. */
  readonly choices: ReadChoices;
  /** Chat with: a new chat of that kind, where this one is; none in a chat about one item. */
  readonly onChatWith?: ((kind: ChatKind) => void) | undefined;
  /**
   * The name of the item a chat on its page is about: the status line says "About: <name>" and
   * the empty chat asks what should change in it (flow-assistant 2.4, 6.1).
   */
  readonly aboutName?: string | undefined;
  /** Reads the chat again after it couldn't load; the panel's own chat by default. */
  readonly onRetry?: (() => void) | undefined;
  /** An empty chat shows the start screen, as in a chat tab (flow-assistant 6). */
  readonly startScreen?: boolean;
}

/**
 * The chat, its first load (H7), a chat that can't load, or no chat (H3), in the panel or a chat
 * tab. While the engine doesn't answer, the chat says so at the top, in the window's words (H12,
 * H15), and Send, Try again and Continue wait with that line as their reason (D5). The chat's model
 * may put its line under the box (H18 to H20). A message the host refused because the workspace
 * isn't trusted opens the trust check (H16).
 */
export function ChatBody(props: ChatBodyProps) {
  const { context, shown, chats, box, announce, onNewChat, lookingAt, skillLink } = props;
  const host = context.services.get(AssistantHostService);
  const engineAnswering = useEngineAnswering(host);
  const send = useSend(chats, announce, host, context);
  const noticeId = useId();
  const view = shown.kind === "chat" ? shown.view : undefined;
  const onStartScreen = props.startScreen === true && isEmpty(view) && engineAnswering;
  useFocusAfterStart(onStartScreen, box);
  const retry = props.onRetry ?? (() => void chats.open());
  if (shown.kind === "none") return <NoChat onNewChat={onNewChat} button={props.newChatButton} />;
  if (shown.kind === "failed") {
    return (
      <EmptyState
        tone="error"
        align="start"
        title={words.cantLoad}
        description={shown.reason}
        action={{ label: words.tryAgain, onClick: retry }}
      />
    );
  }
  const composer = (
    <ChatBox
      view={view}
      chats={chats}
      box={box}
      send={send}
      waitsOn={engineAnswering ? undefined : noticeId}
      context={context}
      glow={onStartScreen}
      host={host}
      choices={props.choices}
      onChatWith={props.onChatWith}
      announce={announce}
    />
  );
  const agent = agentOfView(view, props.choices);
  const chat = (
    <>
      <StatusLine
        view={view}
        agent={agent}
        idle={
          props.aboutName === undefined ? lookingAtLine(lookingAt) : words.about(props.aboutName)
        }
      />
      <ShownItems
        shown={view?.shown ?? []}
        onOpen={props.onOpenItem}
        onRemove={(item) => view !== undefined && chats.removeShown(view.chat.id, item)}
      />
      {view === undefined ? (
        // Fills the transcript's place, so the box is at the bottom from the start (H7).
        <div className="flex min-h-0 flex-1 flex-col">
          <ChatLoading label={words.loading} onRetry={retry} />
        </div>
      ) : (
        <Transcript
          view={view}
          context={context}
          agent={agent}
          aboutName={props.aboutName}
          notice={engineAnswering ? undefined : notAnsweringLine(context)}
          noticeId={noticeId}
          onContinue={() => send(view.chat.id, undefined, () => {})}
          continueWaits={engineAnswering ? undefined : { reason: noticeId }}
        />
      )}
    </>
  );
  return (
    <StartScreen
      on={onStartScreen}
      chat={chat}
      composer={composer}
      link={view === undefined ? null : skillLink(view)}
    />
  );
}

/**
 * A Build chat with nothing sent yet, nor being answered: the start screen's (flow-assistant 6.1).
 * An agent chat starts with the agent's own heading instead.
 */
function isEmpty(view: ChatView | undefined): view is ChatView {
  return (
    view !== undefined &&
    view.chat.kind === "build" &&
    view.messages.length === 0 &&
    !view.answering
  );
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

/** The agent a chat talks to, if it's an agent chat. */
function agentOfView(view: ChatView | undefined, choices: ChatChoices): ChatAgent | undefined {
  return view === undefined ? undefined : agentOf(view.chat, choices);
}

/** The line at the top: an agent chat's orb, name and state, else the status line. */
function StatusLine(props: {
  readonly view: ChatView | undefined;
  readonly agent: ChatAgent | undefined;
  /** The line while nothing runs: "Looking at: Home", or "About: Triage" on an item's page. */
  readonly idle: string;
}) {
  const { view, agent } = props;
  const phone = usePresentation() === "phone";
  if (view !== undefined && agent !== undefined)
    return <AgentStatusLine agent={agent} view={view} />;
  if (phone) return null; // It's in the top bar on a phone (flow-assistant 11.3).
  return <p className="px-4 text-caption text-fg-muted">{statusLine(view, props.idle)}</p>;
}

/**
 * The status line (flow-assistant 2.2): running with the tool, "Stopped by you", else its idle
 * line. Not live.
 */
function statusLine(view: ChatView | undefined, idle: string): string {
  if (view?.answering === true) return runningLine(view.tool);
  if (view?.stoppedByYou === true) return words.stopped;
  return idle;
}

/** The panel's idle line: the page the window shows ("Looking at: Home"), else nothing. */
function lookingAtLine(lookingAt: string | undefined): string {
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
  aboutName,
  notice,
  noticeId,
  onContinue,
  continueWaits,
}: {
  readonly view: ChatView;
  readonly context: WorkspaceContext;
  /** The agent an agent chat talks to: its start says "Chat with Triage" and its description. */
  readonly agent: ChatAgent | undefined;
  /** The item a chat on its page is about, which its start names (flow-assistant 6.1). */
  readonly aboutName: string | undefined;
  /** The engine's line at the top while it doesn't answer (H12). */
  readonly notice: string | undefined;
  readonly noticeId: string;
  /** Continue or Try again on the last reply. */
  readonly onContinue: () => void;
  /** While the engine doesn't answer, Continue and Try again wait on its line (D5). */
  readonly continueWaits: ButtonUnavailable | undefined;
}) {
  const turns = turnsOf(view.messages, view.ends, view.answering);
  if (turns.length === 0 && notice === undefined) {
    return <PanelChatStart agent={agent} aboutName={aboutName} />;
  }
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
