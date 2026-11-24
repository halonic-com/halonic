import {
  Button,
  ChatEndLine,
  ChatLoading,
  ChatMessage,
  ChatText,
  ChatToolLine,
  ChatTranscript,
  CloseIcon,
  EmptyState,
  PlusIcon,
  SidePanel,
} from "@halonicjs/studio-kit";
import type { ItemRef, PanelWindowViewProps, WorkspaceContext } from "@halonicjs/studio-shell";
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
import { AssistantHostService } from "../api.ts";
import { ProposalCard } from "../cards/proposal-card.tsx";
import { toolInWords, buildChatWords as words } from "../chat/build-chat-words.ts";
import {
  type Announce,
  type BuildChats,
  buildChatsOf,
  type ChatView,
  type Shown,
} from "../chat/build-chats.ts";
import { endLine, type ReplyStep, runningLine, type Turn, turnsOf } from "../chat/turns.ts";
import { BuildComposer } from "./build-composer.tsx";
import { ChatHeading, ChatMoreActions } from "./chat-header.tsx";
import { useEngineAnswering, useTrustCheck } from "./send-gate.ts";
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
 * is (L12).
 */
export function AssistantPanel({ context, title, onClose }: PanelWindowViewProps) {
  const host = context.services.get(AssistantHostService);
  const chats = buildChatsOf(host);
  const shown = useSyncExternalStore(chats.subscribe, chats.shown);
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

  // New chat puts focus in the box (flow-assistant 2.2); from the empty panel the box comes back.
  const newChat = () => void chats.newChat().then(() => box.current?.focus());
  const view = shown.kind === "chat" ? shown.view : undefined;
  const heading = view === undefined || view.chat.draft ? title : view.chat.title;
  const header = { host, chats, view, title, box, onNewChat: newChat };

  return (
    <SidePanel
      title={heading}
      heading={<ChatHeading {...header} renaming={renaming} onRenamed={() => setRenaming(false)} />}
      label={title}
      halo
      initialFocus={keepFocus ? focusAsItIs : box}
      onClose={onClose}
      actions={
        <>
          <Button
            variant="ghost"
            size="sm"
            icon={<PlusIcon />}
            label={words.newChat}
            onClick={newChat}
          />
          <ChatMoreActions
            {...header}
            onRename={() => setRenaming(true)}
            afterDelete={() => newChatButton.current}
          />
          <Button
            variant="ghost"
            size="sm"
            icon={<CloseIcon />}
            label={words.close}
            onClick={onClose}
          />
        </>
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
            view.chat.kind === "build" ? (
              <SkillLink host={host} context={context} freshness={view.messages} />
            ) : null
          }
          onOpenItem={(item) => context.openItem?.(item)}
        />
      </div>
    </SidePanel>
  );
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
}

/** Opens the workspace page's Models, where keys are kept (models flow 3.1). */
const openModelsCommand = "workspace.open-models";

/**
 * The chat, its first load (H7), a chat that can't load, or no chat (H3). While the engine doesn't
 * answer, the chat says so at the top and Send waits with that line as its reason (H12, D5); Try
 * again and Continue wait too. A message the host refused because the workspace isn't trusted
 * opens the trust check (H16).
 */
function PanelBody(props: PanelBodyProps) {
  const { context, shown, chats, box, announce, onNewChat, lookingAt, skillLink } = props;
  const host = context.services.get(AssistantHostService);
  const runCommand = context.runCommand;
  const engineAnswering = useEngineAnswering(host);
  const askTrust = useTrustCheck(host);
  const noticeId = useId();
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
  const view = shown.kind === "chat" ? shown.view : undefined;
  return (
    <>
      <p className="px-4 text-caption text-fg-muted">{statusLine(view, lookingAt)}</p>
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
          notice={engineAnswering ? undefined : words.engineNotAnswering}
          noticeId={noticeId}
          onContinue={engineAnswering ? () => send(undefined, () => {}) : undefined}
        />
      )}
      <BuildComposer
        answering={view?.answering === true}
        box={box}
        onSend={(message, putBack) => {
          if (view === undefined || !engineAnswering) return false;
          send(message, putBack);
          return true;
        }}
        onStop={() => chats.stop()}
        sendUnavailable={engineAnswering || view === undefined ? undefined : { reason: noticeId }}
        onGoToKeyField={runCommand && (() => void runCommand(openModelsCommand))}
      />
      {view === undefined ? null : skillLink(view)}
    </>
  );
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
  notice,
  noticeId,
  onContinue,
}: {
  readonly view: ChatView;
  readonly context: WorkspaceContext;
  /** The engine's line at the top while it doesn't answer (H12). */
  readonly notice: string | undefined;
  readonly noticeId: string;
  /** Continue or Try again on the last reply; absent while they would wait. */
  readonly onContinue: (() => void) | undefined;
}) {
  const turns = turnsOf(view.messages, view.ends, view.answering);
  if (turns.length === 0 && notice === undefined) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-1 px-4 py-3">
        <h3 className="text-section text-fg">{words.heading}</h3>
        <p className="text-body text-fg-muted">{words.startLine}</p>
      </div>
    );
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
}: {
  readonly turn: Turn;
  readonly place: CardPlace;
  readonly onContinue: (() => void) | undefined;
}) {
  const end = turn.end;
  // Only the last reply offers Continue or Try again: each carries on that answer without a new
  // message (flow-assistant 3.6), which sends the last message again when nothing ran (H13, H22,
  // H23). After a tool ran there is no Try again, since a tool may have sent something (H24).
  const actions = onContinue === undefined ? [] : endActions(end, onContinue);
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

function endActions(end: Turn["end"], onContinue: () => void) {
  if (end?.kind === "model-call-limit") return [{ label: words.continue, onClick: onContinue }];
  if ((end?.kind === "engine-stopped" || end?.kind === "failed") && !end.toolsRan) {
    return [{ label: words.tryAgain, onClick: onContinue }];
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
