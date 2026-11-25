import { Button } from "@halonicjs/studio-kit";
import { useState } from "react";
import { membersOf } from "../channel-admin.ts";
import { channelAdminWords } from "../channel-admin-words.ts";
import type { ConversationRow, Messenger } from "../messenger.ts";
import { LeaveChannel } from "./leave-channel.tsx";

/** The props of {@link ChannelHeaderActions}. */
export interface ChannelHeaderActionsProps {
  readonly messenger: Messenger;
  readonly row: ConversationRow;
  readonly membersOpen: boolean;
  /** Shows or hides the Members panel. */
  readonly onMembers: () => void;
  /** The person left the channel. */
  readonly onLeft: (() => void) | undefined;
}

/** A channel's header buttons: **Members · 3**, which shows its panel, and **Leave channel**. */
export function ChannelHeaderActions({
  messenger,
  row,
  membersOpen,
  onMembers,
  onLeft,
}: ChannelHeaderActionsProps) {
  const [leaving, setLeaving] = useState(false);
  return (
    <div className="flex shrink-0 gap-1">
      <Button size="sm" variant="ghost" aria-expanded={membersOpen} onClick={onMembers}>
        {channelAdminWords.members.title(membersOf(row).length)}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setLeaving(true)}>
        {channelAdminWords.leave.button}
      </Button>
      {leaving ? (
        <LeaveChannel
          messenger={messenger}
          row={row}
          onCancel={() => setLeaving(false)}
          onLeft={() => {
            setLeaving(false);
            onLeft?.();
          }}
        />
      ) : null}
    </div>
  );
}
