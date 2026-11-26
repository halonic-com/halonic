import { Button, Menu, MoreIcon } from "@halonicjs/studio-kit";
import { messengerWords } from "../messenger-words.ts";

/**
 * The ··· menu at the end of the open chat's header (Sofia's sketch H on HAL-19192), with **Mark
 * as unread** (`messenger.read-marks`).
 */
export function ChatMenu({
  name,
  onMarkUnread,
}: {
  /** The chat's name, for the button's label: "More actions for Chief". */
  readonly name: string;
  readonly onMarkUnread: () => void;
}) {
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
      entries={[{ id: "mark-unread", label: messengerWords.markUnread, onSelect: onMarkUnread }]}
    />
  );
}
