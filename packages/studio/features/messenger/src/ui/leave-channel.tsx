import { Dialog } from "@halonicjs/studio-kit";
import { useState } from "react";
import { channelAdminWords, failureReason } from "../channel-admin-words.ts";
import type { ConversationRow, Messenger } from "../messenger.ts";

/** The props of {@link LeaveChannel}. */
export interface LeaveChannelProps {
  readonly messenger: Messenger;
  readonly row: ConversationRow;
  readonly onCancel: () => void;
  /** The person left; the page closes the channel. */
  readonly onLeft: () => void;
}

/** "Leave Engineering?" (flow H, render k15a): asked once, then the person leaves. */
export function LeaveChannel({ messenger, row, onCancel, onLeft }: LeaveChannelProps) {
  const leave = channelAdminWords.leave;
  const title = row.conversation.title;
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const confirm = async () => {
    setBusy(true);
    setFailure(undefined);
    const result = await messenger.channels.leave(row.conversation.id).catch((error: unknown) => {
      console.error("Leaving the channel failed:", error);
      return undefined;
    });
    setBusy(false);
    if (result?.outcome === "done") return onLeft();
    const source = row.source?.label ?? "";
    const reason = failureReason(result, source);
    setFailure(leave.failed(title, reason));
  };
  return (
    <Dialog
      title={leave.title(title)}
      size="sm"
      confirm={{ label: leave.confirm, busyLabel: leave.busy }}
      retryLabel={channelAdminWords.tryAgain}
      busy={busy}
      {...(failure === undefined ? {} : { error: failure })}
      onConfirm={() => void confirm()}
      onCancel={onCancel}
    >
      <p className="text-body">{leave.line}</p>
    </Dialog>
  );
}
