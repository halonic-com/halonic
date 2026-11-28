import type { Conversation, MessagingAgent, MessagingId } from "@halonicjs/ports";
import {
  Avatar,
  agentTint,
  Button,
  PlainList,
  PlainRow,
  SKELETON_AFTER_MS,
  SkeletonBar,
  type SkeletonBarWidth,
  STILL_LOADING_AFTER_MS,
  TimeStamp,
} from "@halonicjs/studio-kit";
import { type ReactNode, type RefObject, useEffect, useState } from "react";
import { phoneMessengerWords as words } from "./phone-messenger-words.ts";

/** What the chat rows need besides the conversations. */
export interface ChatRowsProps {
  readonly conversations: readonly Conversation[];
  /** The agents read, by id: a chat's picture and name. */
  readonly agents: ReadonlyMap<MessagingId, MessagingAgent>;
  /** The sources read, their labels by id: "name · source" on a chat's row. */
  readonly sources: ReadonlyMap<MessagingId, string>;
  /** What was typed and not sent, per chat: its "Draft: …" line. */
  readonly drafts: ReadonlyMap<MessagingId, string>;
  readonly now: Date;
  readonly onOpen: (conversation: Conversation) => void;
}

/**
 * The phone's chats (p02b), drawn by the kit's plain rows as the desktop Messenger's are: the
 * agent's picture, "name · source" (a channel's size instead), the time on the right, the violet
 * dot while the chat waits for the person. The second line is p02b's own, not the desktop's:
 * "Draft: …" for text left in its box, else "Working…" in running azure while its agent works.
 */
export function ChatRows({ conversations, agents, sources, drafts, now, onOpen }: ChatRowsProps) {
  return (
    <PlainList label={words.chatsLabel}>
      {conversations.map((conversation) => {
        const channel = conversation.members !== undefined;
        const agent = agents.get(conversation.agent);
        return (
          <PlainRow
            key={conversation.id}
            id={conversation.id}
            picture={
              <Avatar
                name={channel ? conversation.title : (agent?.name ?? conversation.title)}
                tint={channel ? undefined : agentTint(conversation.agent)}
                size="sidebar"
              />
            }
            title={conversation.title}
            afterTitle={
              channel
                ? words.channelSize(conversation.members?.length ?? 0)
                : sources.get(conversation.source)
            }
            flag={conversation.waitingForMe ? words.needsYouDot : undefined}
            line={rowLine(conversation, drafts.get(conversation.id))}
            time={<TimeStamp at={new Date(conversation.updatedAt)} now={now} />}
            onSelect={() => onOpen(conversation)}
          />
        );
      })}
    </PlainList>
  );
}

/** The chat Back came from, and whether its row has had the focus yet. */
export interface ReturnTo {
  readonly id: MessagingId;
  placed: boolean;
}

/**
 * After Back, gives the focus once to the chat the person came back from (WCAG 2.4.3): its row in
 * `list`, or the chips once the row has left on a later read, as from Waiting for me after a reply,
 * but only if the focus fell to the page. It runs when `rows` change, not on every draw, and lets
 * go (clears `returnTo`) once the person moves on from the row or the row has left, the shape of
 * the Inbox's `InboxList`.
 */
export function useFocusOnReturn(
  list: RefObject<HTMLElement | null>,
  returnTo: RefObject<ReturnTo | undefined>,
  rows: readonly Conversation[] | undefined,
) {
  useEffect(() => {
    const target = returnTo.current;
    const node = list.current;
    // Nothing to give back, or the list isn't drawn yet (still loading): wait for its rows.
    if (target === undefined || node === null) return;
    const items = [...node.querySelectorAll<HTMLElement>("li[data-row-id]")];
    const row = items.find((each) => each.dataset["rowId"] === target.id)?.querySelector("button");
    if (row != null && !target.placed) {
      target.placed = true;
      row.focus();
      return;
    }
    if (row != null) {
      // The person moved on from the row: nothing to look after.
      if (row.ownerDocument.activeElement !== row) returnTo.current = undefined;
      return;
    }
    returnTo.current = undefined;
    if (target.placed && !focusFell(node)) return;
    node.querySelector<HTMLElement>('input[type="radio"]:checked')?.focus();
  }, [list, returnTo, rows]);
}

/** Whether the focus is on nothing but the page: in `node`'s own document (B7 item 12). */
function focusFell(node: Element): boolean {
  const page = node.ownerDocument;
  return page.activeElement === null || page.activeElement === page.body;
}

/** A row's second line (p02b): its draft first, else whether its agent is working. */
function rowLine(conversation: Conversation, draft: string | undefined): ReactNode {
  const typed = draft?.trim().split("\n")[0] ?? "";
  if (typed !== "") return words.draft(typed);
  if (conversation.agentWorking === true) {
    return <span className="text-running">{words.working}</span>;
  }
  return undefined;
}

/** Three skeleton rows, a little different in width. Fixed, so screenshots are stable. */
const skeletonWidths: readonly { name: SkeletonBarWidth; line: SkeletonBarWidth }[] = [
  { name: "2/5", line: "7/10" },
  { name: "1/3", line: "1/2" },
  { name: "1/2", line: "3/5" },
];

/**
 * The chats while they first load, as the desktop's (HAL-18481): nothing for `SKELETON_AFTER_MS`,
 * so a fast read doesn't flash, then skeleton rows of a chat row's size, hidden from screen
 * readers, which hear "Loading Messenger" (HAL-20039) from the start instead. After
 * `STILL_LOADING_AFTER_MS` "Still loading" and **Try again** show under them.
 */
export function ChatsSkeleton({ onRetry }: { readonly onRetry: () => void }) {
  const wait = useWait();
  // Said from the start, as the Inbox's: only the rows wait, so a fast read doesn't flash.
  const status = wait === "slow" ? words.stillLoading : words.loading;
  return (
    <div>
      {/* There from the start, so screen readers announce the text when it arrives. */}
      <span role="status" className="sr-only">
        {status}
      </span>
      <div aria-busy="true">
        {wait === "early" ? null : (
          <ul aria-hidden="true" className="flex flex-col gap-1">
            {skeletonWidths.map((widths) => (
              <li key={widths.name} className="flex min-h-20 items-center gap-3 px-3 py-2.5">
                <SkeletonBar kind="sidebar" />
                <span className="flex min-w-0 flex-1 flex-col gap-2">
                  <SkeletonBar kind="title" width={widths.name} />
                  <SkeletonBar kind="meta" width={widths.line} />
                </span>
              </li>
            ))}
          </ul>
        )}
        {wait === "slow" ? (
          <div className="flex items-center gap-3 px-3 py-2">
            <span aria-hidden="true" className="text-small text-fg-muted">
              {words.stillLoading}
            </span>
            <Button variant="secondary" size="touch" onClick={onRetry}>
              {words.tryAgain}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Where a wait is, counted from the first render: too early to show anything, showing, or long. */
function useWait(): "early" | "showing" | "slow" {
  const [wait, setWait] = useState<"early" | "showing" | "slow">("early");
  useEffect(() => {
    const show = setTimeout(() => setWait("showing"), SKELETON_AFTER_MS);
    const slow = setTimeout(() => setWait("slow"), STILL_LOADING_AFTER_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(slow);
    };
  }, []);
  return wait;
}
