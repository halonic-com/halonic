import type { MessagingId } from "@halonicjs/ports";
import { Button, Menu } from "@halonicjs/studio-kit";
import { useState } from "react";
import { channelAdminWords } from "../channel-admin-words.ts";
import type { Messenger } from "../messenger.ts";
import { BrowseChannels } from "./browse-channels.tsx";
import { NewChannelDialog } from "./new-channel-dialog.tsx";

/** The props of {@link NewMenu}. */
export interface NewMenuProps {
  readonly messenger: Messenger;
  /** A channel was made or joined: the page reads its list again and opens it. */
  readonly onOpen: (channel: MessagingId) => void;
}

/**
 * **New ▾** above the Messenger's list (flow G, render k09a): New channel and Browse channels, each
 * opening its dialog. "New chat" waits for a port call that starts a direct chat.
 */
export function NewMenu({ messenger, onOpen }: NewMenuProps) {
  const words = channelAdminWords.menu;
  const [open, setOpen] = useState<"channel" | "browse" | undefined>(undefined);
  const opened = (channel: MessagingId) => {
    setOpen(undefined);
    onOpen(channel);
  };
  return (
    <>
      <Menu
        trigger={(props) => (
          <Button {...props} size="sm" variant="secondary">
            {words.label} <span aria-hidden="true">▾</span>
          </Button>
        )}
        entries={[
          { id: "channel", label: words.channel, onSelect: () => setOpen("channel") },
          { id: "browse", label: words.browse, onSelect: () => setOpen("browse") },
        ]}
      />
      {open === "channel" ? (
        <NewChannelDialog
          messenger={messenger}
          onCancel={() => setOpen(undefined)}
          onCreated={opened}
        />
      ) : null}
      {open === "browse" ? (
        <BrowseChannels
          messenger={messenger}
          onClose={() => setOpen(undefined)}
          onJoined={opened}
        />
      ) : null}
    </>
  );
}
