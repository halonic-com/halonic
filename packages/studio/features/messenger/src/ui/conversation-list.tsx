import type { MessagingId } from "@halonicjs/ports";
import { Avatar, TabList, TabPanel, useTabIds } from "@halonicjs/studio-kit";
import { channelSize, isChannel, workingMembers } from "../channel.ts";
import { waitingLine } from "../channel-waiting.ts";
import { chatAgent, chatName } from "../chat-name.ts";
import { activityOf, type ConversationRow, type MessengerTab } from "../messenger.ts";
import { messengerWords } from "../messenger-words.ts";

/** The props of {@link ConversationList}. */
export interface ConversationListProps {
  readonly tab: MessengerTab;
  readonly onTab: (tab: MessengerTab) => void;
  /** The tab's conversations, newest first. */
  readonly rows: readonly ConversationRow[];
  readonly selected: MessagingId | undefined;
  readonly onSelect: (conversation: MessagingId) => void;
}

const tabs = [
  { id: "all", label: messengerWords.tabs.all },
  { id: "waiting", label: messengerWords.tabs.waiting },
] as const;

/**
 * The Messenger's list (HAL-17421 render 4a): the tabs All and Waiting for
 * me, then one row per conversation with its name, its source's label and its
 * agent's activity. The open conversation's row is marked current.
 */
export function ConversationList({ tab, onTab, rows, selected, onSelect }: ConversationListProps) {
  const ids = useTabIds();
  return (
    <div className="flex min-h-0 flex-col gap-2">
      <TabList
        label={messengerWords.tabsLabel}
        tabs={tabs}
        selected={tab}
        onSelect={onTab}
        ids={ids}
      />
      <TabPanel ids={ids} tabs={tabs} selected={tab}>
        {rows.length === 0 ? (
          <p className="px-2 py-4 text-small text-fg-muted">
            {tab === "waiting" ? messengerWords.nothingWaiting : messengerWords.noChats}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {rows.map((row) => (
              <li key={row.conversation.id}>
                <Row
                  row={row}
                  tab={tab}
                  current={row.conversation.id === selected}
                  onSelect={onSelect}
                />
              </li>
            ))}
          </ul>
        )}
      </TabPanel>
    </div>
  );
}

/**
 * What a row says under its name: in Waiting for me, a channel's oldest question ("Elena asks you:
 * Which hostname? · +1 more"); for a channel, who is working; for a chat,
 * its agent's activity.
 */
function rowLine(row: ConversationRow, tab: MessengerTab): string {
  if (!isChannel(row)) return messengerWords.activity[activityOf(row)];
  const waiting = tab === "waiting" ? waitingLine(row.questions ?? []) : undefined;
  return waiting ?? workingMembers(row) ?? "";
}

function Row({
  row,
  tab,
  current,
  onSelect,
}: {
  readonly row: ConversationRow;
  readonly tab: MessengerTab;
  readonly current: boolean;
  readonly onSelect: (conversation: MessagingId) => void;
}) {
  const activity = rowLine(row, tab);
  // A channel's row says how many agents it has (k14a); a chat's, its source.
  const after = isChannel(row) ? channelSize(row) : row.source?.label;
  return (
    <button
      type="button"
      data-chat={row.conversation.id}
      aria-current={current ? "true" : undefined}
      onClick={() => onSelect(row.conversation.id)}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-start hover:bg-surface-muted focus-ring aria-[current=true]:bg-surface-muted"
    >
      <Avatar name={chatAgent(row)?.name ?? row.conversation.title} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body">
          <bdi>{chatName(row)}</bdi>
          {after === undefined ? null : (
            <span className="text-small text-fg-muted"> · {after}</span>
          )}
        </span>
        {activity === "" ? null : <span className="text-small text-fg-muted">{activity}</span>}
      </span>
    </button>
  );
}
