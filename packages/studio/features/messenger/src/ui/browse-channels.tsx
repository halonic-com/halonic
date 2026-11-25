import type { Conversation, MessagingId } from "@halonicjs/ports";
import { Button, Dialog } from "@halonicjs/studio-kit";
import { useEffect, useState } from "react";
import type { SourceChannels } from "../channel-admin.ts";
import { channelAdminWords } from "../channel-admin-words.ts";
import type { Messenger } from "../messenger.ts";

const words = channelAdminWords.browse;

/** The props of {@link BrowseChannels}. */
export interface BrowseChannelsProps {
  readonly messenger: Messenger;
  readonly onClose: () => void;
  /** The person joined the channel; the page opens it. */
  readonly onJoined: (channel: MessagingId) => void;
}

/**
 * Browse channels (flow H, render k12b): each source's channels the person isn't in, each with
 * **Join** (requirement `messenger.channel-create`). A join that failed says why beside its
 * channel, with **Try again**.
 */
export function BrowseChannels({ messenger, onClose, onJoined }: BrowseChannelsProps) {
  const [found, setFound] = useState<readonly SourceChannels[]>([]);
  useEffect(() => {
    messenger.channels.browse().then(setFound, (error: unknown) => {
      console.error("Browse channels couldn't read the channels:", error);
    });
  }, [messenger]);
  return (
    <Dialog title={words.title} size="md" onCancel={onClose}>
      <div className="flex flex-col gap-4">
        {found.map(({ source, channels }) => (
          <section key={source.id} className="flex flex-col gap-2">
            <p className="text-small text-fg-muted">{words.subtitle(source.label)}</p>
            {channels.length === 0 ? (
              <p className="text-small text-fg-muted">{words.empty(source.label)}</p>
            ) : (
              <ul className="flex flex-col gap-1" aria-label={words.subtitle(source.label)}>
                {channels.map((channel) => (
                  <ChannelItem
                    key={channel.id}
                    messenger={messenger}
                    channel={channel}
                    source={source.label}
                    onJoined={onJoined}
                  />
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </Dialog>
  );
}

/** One channel to join, and why its join failed, with **Try again**. */
function ChannelItem({
  messenger,
  channel,
  source,
  onJoined,
}: {
  readonly messenger: Messenger;
  readonly channel: Conversation;
  readonly source: string;
  readonly onJoined: (channel: MessagingId) => void;
}) {
  const [joining, setJoining] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const join = async () => {
    setJoining(true);
    setFailed(undefined);
    const result = await messenger.channels.join(channel.id).catch((error: unknown) => {
      console.error("Joining the channel failed:", error);
      return undefined;
    });
    setJoining(false);
    if (result?.outcome === "done") return onJoined(channel.id);
    const reason =
      result === undefined
        ? channelAdminWords.noAnswer
        : channelAdminWords.reason[result.reason](source);
    setFailed(words.joinFailed(channel.title, reason));
  };
  return (
    <li data-browse-channel className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-body">
          <bdi>{channel.title}</bdi>
        </span>
        <Button size="sm" busy={joining} busyLabel={words.join} onClick={() => void join()}>
          {words.join}
        </Button>
      </div>
      {failed === undefined ? null : (
        <p role="alert" className="text-small text-danger">
          {failed}{" "}
          <Button size="sm" variant="ghost" onClick={() => void join()}>
            {channelAdminWords.tryAgain}
          </Button>
        </p>
      )}
    </li>
  );
}
