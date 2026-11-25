import type { ChannelResult, MessagingAgent, MessagingId } from "@halonicjs/ports";
import { useState } from "react";
import { memberName } from "../channel.ts";
import { type Membership, withAgent, withoutAgent } from "../channel-admin.ts";
import { channelAdminWords, failureReason } from "../channel-admin-words.ts";
import type { ConversationRow, Messenger } from "../messenger.ts";

/** A change that waits for the person to confirm it in a dialog. */
export type Pending =
  | { readonly kind: "add"; readonly agent: MessagingAgent }
  | { readonly kind: "remove-lead"; readonly lead: string };

/**
 * The Members panel's changes; `onChanged` runs after each one the source took. `setMembers` runs only from here: at once for Make lead, removing a
 * member who isn't the lead and adding to a channel with no messages; otherwise only once the
 * person confirms the pending change (the history notice, or a new lead).
 */
export function useMembers(messenger: Messenger, row: ConversationRow, onChanged: () => void) {
  const [pending, setPending] = useState<Pending | undefined>(undefined);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  // None once the source is gone: the failure then says so instead of naming it.
  const source = row.source?.label;

  const failed = (error: unknown) => {
    console.error("Changing the channel's members failed:", error);
    return undefined;
  };
  const apply = async (membership: Membership): Promise<boolean> => {
    setBusy(true);
    setFailure(undefined);
    const result: ChannelResult | undefined = await messenger.channels
      .setMembers(row.conversation.id, membership)
      .catch(failed);
    setBusy(false);
    // The page reads the channel again at once, whether or not the source reports its own write.
    if (result?.outcome === "done") {
      onChanged();
      return true;
    }
    const reason = failureReason(result, source);
    setFailure(channelAdminWords.members.failed(reason));
    return false;
  };
  const change = (membership: Membership) => void apply(membership);
  const confirm = (membership: Membership) => {
    void apply(membership).then((done) => {
      if (done) setPending(undefined);
    });
  };
  const cancel = () => {
    setPending(undefined);
    setFailure(undefined);
  };
  const add = (agent: MessagingAgent) => {
    // A channel with no messages has nothing to show the new member, so it adds at once.
    messenger.channels.hasHistory(row.conversation.id).then(
      (history) =>
        history ? setPending({ kind: "add", agent }) : change(withAgent(row, agent.id)),
      (error: unknown) => {
        failed(error);
        setFailure(channelAdminWords.members.failed(failureReason(undefined, source)));
      },
    );
  };
  const remove = (member: MessagingId) => {
    if (member !== row.conversation.agent) return change(withoutAgent(row, member));
    setPending({ kind: "remove-lead", lead: memberName(row, member) });
  };
  return { pending, failure, busy, change, confirm, cancel, add, remove };
}
