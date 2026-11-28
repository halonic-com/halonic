import { Button, Menu, type MenuEntry, MoreIcon } from "@halonicjs/studio-kit";
import { messengerWords } from "../messenger-words.ts";

/**
 * The ··· menu at the end of the open chat's header (Sofia's sketch H on HAL-19192), with **Mark
 * as unread** while there's an agent's message to mark (`messenger.read-marks`) and **Pin chat** or
 * **Unpin chat** (`messenger.pinned-chats`).
 */
export function ChatMenu({
  name,
  onMarkUnread,
  pin,
}: {
  /** The chat's name, for the button's label: "More actions for Chief". */
  readonly name: string;
  readonly onMarkUnread?: (() => void) | undefined;
  /** Whether the chat is pinned, and what pins or unpins it. */
  readonly pin?: { readonly pinned: boolean; readonly onToggle: () => void } | undefined;
}) {
  // Pin chat first, so it keeps its place whether Mark as unread shows or not.
  const entries: MenuEntry[] = [];
  if (pin !== undefined) {
    const label = pin.pinned ? messengerWords.unpinChat : messengerWords.pinChat;
    entries.push({ id: "pin", label, onSelect: pin.onToggle });
  }
  if (onMarkUnread !== undefined) {
    entries.push({ id: "mark-unread", label: messengerWords.markUnread, onSelect: onMarkUnread });
  }
  if (entries.length === 0) return null;
  return (
    <Menu
      align="end"
      trigger={(trigger) => (
        <Button
          {...trigger}
          variant="ghost"
          size="sm"
          icon={<MoreIcon />}
          label={messengerWords.moreActions(name)}
        />
      )}
      entries={entries}
    />
  );
}
