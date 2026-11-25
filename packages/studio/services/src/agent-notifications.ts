import type {
  AgentMessaging,
  Conversation,
  InboxItem,
  MessagingId,
  WorkItem,
} from "@halonicjs/ports";

/**
 * What a notification opens in Studio: an inbox item, a conversation, a piece
 * of work, the inbox as a whole (a quiet-hours summary, whose `id` is empty),
 * a seat on Spend and seats, a source's merge queue, a run in Runs, or Runs'
 * Failed group (`runs-failed`, for several failures shown as one).
 */
export interface NoticeTarget {
  kind:
    | "inbox-item"
    | "conversation"
    | "work"
    | "inbox"
    | "seat"
    | "merge-queue"
    | "run"
    | "runs-failed";
  id: MessagingId;
}

/** One desktop notification: why it was shown, what it says and what clicking it opens. */
export interface AgentNotice {
  reason: "card" | "question" | "done" | "summary" | "seat" | "queue" | "run";
  title: string;
  body: string;
  target: NoticeTarget;
}

/**
 * Shows notifications, such as the desktop shell's. It calls `onClick` when
 * the person clicks the notification, if the system tells it.
 */
export interface Notifier {
  show(notice: AgentNotice, onClick: () => void): Promise<void>;
}

/** What {@link watchAgentNotifications} needs besides the port and the notifier. */
export interface AgentNotificationsOptions {
  /** Opens the target in Studio. It only shows it: it never answers or sends. */
  open(target: NoticeTarget): void;
  /** Hears a failed read or a notification the system refused; the watch goes on. */
  onError(error: unknown): void;
}

/** A running watch; `stop` ends it and resolves once it has. */
export interface AgentNotificationsWatch {
  /** Resolves once the first read is in: what it found shows nothing. */
  ready: Promise<void>;
  stop(): Promise<void>;
}

/** What one read of the port gave, as much as the notifications compare. */
interface Snapshot {
  inbox: readonly InboxItem[];
  conversations: readonly Conversation[];
  work: readonly WorkItem[];
}

/**
 * Notifies the person of a new open inbox item, a conversation that starts
 * waiting for them, and work that moves to `done` which they asked for
 * (requirement `services.agent-notifications`). Any other change, such as a
 * reply while a conversation already waits, shows nothing. What is there when
 * the watch starts shows nothing either.
 *
 * Clicking a notification only opens its item through `options.open`: the
 * watch never calls `answer` or `send`.
 *
 * @example
 * const watch = watchAgentNotifications(messaging, shellNotifier(ipc), { open, onError });
 * await watch.stop();
 */
export function watchAgentNotifications(
  messaging: AgentMessaging,
  notifier: Notifier,
  options: AgentNotificationsOptions,
): AgentNotificationsWatch {
  // Listen before the first read, so a change between the two isn't missed.
  const changes = messaging.changes()[Symbol.asyncIterator]();
  const first = readOrReport(messaging, options);
  const running = follow(messaging, changes, first, notifier, options);
  return {
    ready: first.then(() => undefined),
    async stop() {
      await changes.return?.();
      await running;
    },
  };
}

async function follow(
  messaging: AgentMessaging,
  changes: AsyncIterator<MessagingId>,
  first: Promise<Snapshot | undefined>,
  notifier: Notifier,
  options: AgentNotificationsOptions,
): Promise<void> {
  let last = await first;
  for (
    let change = await nextOrReport(changes, options);
    change;
    change = await nextOrReport(changes, options)
  ) {
    const next = await readOrReport(messaging, options);
    if (last !== undefined && next !== undefined) {
      for (const notice of newNotices(last, next)) {
        const open = () => options.open(notice.target);
        await notifier.show(notice, open).catch(options.onError);
      }
    }
    last = next ?? last;
  }
}

/**
 * Whether the port reported another change. A rejected `next` is reported once and ends the
 * watch as `stop` would, instead of leaving the rejection unhandled.
 */
async function nextOrReport(
  changes: AsyncIterator<MessagingId>,
  options: AgentNotificationsOptions,
): Promise<boolean> {
  try {
    return (await changes.next()).done !== true;
  } catch (error) {
    options.onError(error);
    return false;
  }
}

async function readOrReport(
  messaging: AgentMessaging,
  options: AgentNotificationsOptions,
): Promise<Snapshot | undefined> {
  try {
    const [inbox, conversations, work] = await Promise.all([
      messaging.listInboxItems(),
      messaging.listConversations(),
      messaging.listWork(),
    ]);
    return { inbox, conversations, work };
  } catch (error) {
    options.onError(error);
    return undefined;
  }
}

/** The notices for what changed from `before` to `after`. */
function newNotices(before: Snapshot, after: Snapshot): AgentNotice[] {
  return [...newCards(before, after), ...newQuestions(before, after), ...newlyDone(before, after)];
}

function newCards(before: Snapshot, after: Snapshot): AgentNotice[] {
  const known = new Set(before.inbox.map((item) => item.id));
  return after.inbox
    .filter((item) => item.state.kind === "open" && !known.has(item.id))
    .map((item) => ({
      reason: "card",
      title: `New card from ${authorName(item)}`,
      body: firstLine(item.question),
      target: { kind: "inbox-item", id: item.id },
    }));
}

function newQuestions(before: Snapshot, after: Snapshot): AgentNotice[] {
  const waiting = new Set(
    before.conversations.filter((each) => each.waitingForMe).map((each) => each.id),
  );
  return after.conversations
    .filter((conversation) => conversation.waitingForMe && !waiting.has(conversation.id))
    .map((conversation) => ({
      reason: "question",
      title: `${conversation.title} is waiting for you`,
      body: "",
      target: { kind: "conversation", id: conversation.id },
    }));
}

/**
 * Work that is `done` now and wasn't before, which the person asked for: an
 * inbox item about it that they answered themselves.
 */
function newlyDone(before: Snapshot, after: Snapshot): AgentNotice[] {
  const doneBefore = new Set(
    before.work.filter((each) => each.state === "done").map((each) => each.id),
  );
  const asked = new Set(
    after.inbox
      .filter((item) => item.state.kind === "answered" && item.state.by.kind === "me")
      .flatMap((item) => (item.work === undefined ? [] : [item.work])),
  );
  return after.work
    .filter((work) => work.state === "done" && !doneBefore.has(work.id) && asked.has(work.id))
    .map((work) => ({
      reason: "done",
      title: `Done: ${work.label}`,
      body: work.title,
      target: { kind: "work", id: work.id },
    }));
}

function authorName(item: InboxItem): string {
  return item.from.kind === "me" ? "you" : item.from.name;
}

/**
 * The question's first line, as plain text for the system's notification.
 * It is agent-written, but the system shows it as text, never as Markdown.
 */
function firstLine(text: string): string {
  return text.split("\n", 1).join("").trim();
}
