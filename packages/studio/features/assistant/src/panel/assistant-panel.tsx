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
import type { PanelWindowViewProps, WorkspaceContext } from "@halonicjs/studio-shell";
import {
  Fragment,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { AssistantHostService } from "../api.ts";
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

/**
 * The Assistant's side panel (flow-assistant 2.2): the header with the chat's title, **New chat**
 * and ✕, the status line, and the Build chat. It opens on the chat it showed last, else the most
 * recently used one, else a new Build chat, with focus in the box. The region is named
 * "Assistant" whatever the chat's title is (L12).
 */
export function AssistantPanel({ context, title, onClose }: PanelWindowViewProps) {
  const chats = buildChatsOf(context.services.get(AssistantHostService));
  const shown = useSyncExternalStore(chats.subscribe, chats.shown);
  const lookingAt = useShownTitle(context);
  const box = useRef<HTMLTextAreaElement>(null);
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

  return (
    <SidePanel
      title={heading}
      label={title}
      halo
      initialFocus={box}
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
          shown={shown}
          chats={chats}
          box={box}
          announce={announce}
          onNewChat={newChat}
          lookingAt={lookingAt}
        />
      </div>
    </SidePanel>
  );
}

interface PanelBodyProps {
  readonly shown: Shown;
  readonly chats: BuildChats;
  readonly box: RefObject<HTMLTextAreaElement | null>;
  readonly announce: Announce;
  readonly onNewChat: () => void;
  /** The page the window shows, as its tab names it; none in a window without tabs. */
  readonly lookingAt: string | undefined;
}

/** The chat, its first load (H7), a chat that can't load, or no chat (H3). */
function PanelBody({ shown, chats, box, announce, onNewChat, lookingAt }: PanelBodyProps) {
  if (shown.kind === "none") {
    return (
      <EmptyState
        plain
        title={words.noChat}
        description={words.noChatLine}
        action={{ label: words.newChat, onClick: onNewChat }}
      />
    );
  }
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
      {view === undefined ? (
        <ChatLoading label={words.loading} onRetry={() => void chats.open()} />
      ) : (
        <Transcript view={view} onContinue={() => void chats.send(undefined, announce)} />
      )}
      <BuildComposer
        answering={view?.answering === true}
        box={box}
        onSend={(message) => {
          if (view === undefined) return false;
          void chats.send(message, announce);
          return true;
        }}
        onStop={() => chats.stop()}
      />
    </>
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
  onContinue,
}: {
  readonly view: ChatView;
  readonly onContinue: () => void;
}) {
  const turns = turnsOf(view.messages, view.ends, view.answering);
  if (turns.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-1 px-4 py-3">
        <h3 className="text-section text-fg">{words.heading}</h3>
        <p className="text-body text-fg-muted">{words.startLine}</p>
      </div>
    );
  }
  return (
    <ChatTranscript label={words.transcript}>
      {turns.map((turn, index) => (
        // Turns are only added at the end, so their place is their key.
        <Fragment key={index}>
          <ChatMessage from="you">{turn.message}</ChatMessage>
          <Reply turn={turn} onContinue={index === turns.length - 1 ? onContinue : undefined} />
        </Fragment>
      ))}
    </ChatTranscript>
  );
}

function Reply({
  turn,
  onContinue,
}: {
  readonly turn: Turn;
  readonly onContinue: (() => void) | undefined;
}) {
  const end = turn.end;
  // Only the last reply's limit offers Continue: it carries on that answer (flow-assistant 3.6).
  const actions =
    end?.kind === "model-call-limit" && onContinue !== undefined
      ? [{ label: words.continue, onClick: onContinue }]
      : [];
  return (
    <ChatMessage from="reply" heading={words.said}>
      {turn.steps.map((step, index) => (
        // Steps are only added at the end, so their place is their key.
        <Step key={index} step={step} />
      ))}
      {end === undefined ? null : (
        <ChatEndLine tone={end.kind === "failed" ? "danger" : "plain"} actions={actions}>
          {endLine(end)}
        </ChatEndLine>
      )}
    </ChatMessage>
  );
}

function Step({ step }: { readonly step: ReplyStep }) {
  if (step.kind === "text") return <ChatText>{step.text}</ChatText>;
  return (
    <ChatToolLine state={step.state}>{words.tool[step.state](toolInWords(step.name))}</ChatToolLine>
  );
}
