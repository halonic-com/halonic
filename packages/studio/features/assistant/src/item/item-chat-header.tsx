import { Button, Menu, MoreIcon } from "@halonicjs/studio-kit";
import { buildChatWords } from "../chat/build-chat-words.ts";
import { chatMenuWords } from "../chat/chat-menu-words.ts";
import { type ChatHeaderProps, ChatHeading } from "../panel/chat-header.tsx";

/** Props for {@link ItemChatHeader}. */
export type ItemChatHeaderProps = Omit<ChatHeaderProps, "agents"> & {
  /** Gives the chat its own tab; none for a draft, or where there are no tabs. */
  readonly onOpenAsTab: (() => void) | undefined;
};

/**
 * The row above the chat on an item's page (flow-assistant 2.4): the chat menu, which lists only
 * the chats about the item, and a ⋮ with **Open as tab**. Open as tab is in the ⋮ rather than an
 * icon, as the column is narrower than the panel.
 */
export function ItemChatHeader(props: ItemChatHeaderProps) {
  const { view, onOpenAsTab } = props;
  return (
    <div className="flex min-w-0 items-center gap-1 px-2 pt-2">
      <div className="min-w-0 flex-1">
        {/* A chat about an item is a Build chat, so its rows need no agents' colours. */}
        <ChatHeading {...props} agents={[]} renaming={false} onRenamed={() => {}} />
      </div>
      {view === undefined || onOpenAsTab === undefined ? null : (
        <Menu
          align="end"
          trigger={(trigger) => (
            <Button
              {...trigger}
              variant="ghost"
              size="sm"
              icon={<MoreIcon />}
              label={chatMenuWords.moreActions(view.chat.title)}
            />
          )}
          entries={[{ id: "open-as-tab", label: buildChatWords.openAsTab, onSelect: onOpenAsTab }]}
        />
      )}
    </div>
  );
}
