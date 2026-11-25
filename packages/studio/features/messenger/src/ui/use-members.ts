import type { ChannelResult, MessagingAgent, MessagingId } from "@halonicjs/ports";
import { type RefObject, useEffect, useState } from "react";
import { memberName } from "../channel.ts";
import { type Membership, membersOf, withAgent, withLead, withoutAgent } from "../channel-admin.ts";
import { channelAdminWords, failureReason } from "../channel-admin-words.ts";
import type { ConversationRow, Messenger } from "../messenger.ts";

const words = channelAdminWords.members;

/** A change that waits for the person to confirm it in a dialog. */
export type Pending =
  | { readonly kind: "add"; readonly agent: MessagingAgent }
  | { readonly kind: "remove-lead"; readonly lead: string };

/** Where focus goes once a change shows in the panel, and what the status region says. */
interface After {
  readonly line: string;
  readonly focus: (panel: HTMLElement) => HTMLElement | null | undefined;
}

/** A change the source took, waiting for the panel to show it before focus moves. */
interface Landed extends After {
  readonly membership: Membership;
}

/**
 * The Members panel's changes; `onChanged` runs after each one the source took. `setMembers` runs only from here: at once for Make lead, removing a
 * member who isn't the lead and adding to a channel with no messages; otherwise only once the
 * person confirms the pending change (the history notice, or a new lead).
 *
 * Each change takes away the button that had focus, so once the panel shows it, focus moves on
 * (WCAG 2.4.3) and `announce` says what changed (4.1.3): after a remove to the next row's
 * **Remove from channel**, else **Add an agent**, else the heading; after Make lead or an add to
 * that agent's row (HAL-18835).
 */
export function useMembers(
  messenger: Messenger,
  row: ConversationRow,
  onChanged: () => void,
  announce: (line: string) => void,
  panel: RefObject<HTMLElement | null>,
) {
  const [pending, setPending] = useState<Pending | undefined>(undefined);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [landed, setLanded] = useState<Landed | undefined>(undefined);
  // None once the source is gone: the failure then says so instead of naming it.
  const source = row.source?.label;
  const channel = row.conversation.title;

  useEffect(() => {
    if (landed === undefined || !shows(row, landed.membership) || panel.current === null) return;
    (landed.focus(panel.current) ?? panel.current.querySelector<HTMLElement>("h3"))?.focus();
    setLanded(undefined);
  }, [row, landed, panel]);

  const failed = (error: unknown) => {
    console.error("Changing the channel's members failed:", error);
    return undefined;
  };
  const apply = async (membership: Membership, after: After): Promise<boolean> => {
    setBusy(true);
    setFailure(undefined);
    const result: ChannelResult | undefined = await messenger.channels
      .setMembers(row.conversation.id, membership)
      .catch(failed);
    setBusy(false);
    // The page reads the channel again at once, whether or not the source reports its own write.
    if (result?.outcome === "done") {
      announce(after.line);
      setLanded({ ...after, membership });
      onChanged();
      return true;
    }
    const reason = failureReason(result, source);
    setFailure(words.failed(reason));
    return false;
  };
  const removed = (member: MessagingId): After => {
    const next = membersOf(row)[membersOf(row).indexOf(member) + 1];
    return {
      line: words.removed(memberName(row, member), channel),
      focus: (within) =>
        next === undefined
          ? buttonNamed(within, words.add)
          : buttonNamed(rowOf(within, next), words.remove),
    };
  };
  const added = (agent: MessagingAgent): After => ({
    line: words.added(agent.name, channel),
    focus: (within) => rowOf(within, agent.id)?.querySelector("button"),
  });
  const makeLead = (member: MessagingId) =>
    void apply(withLead(row, member), {
      line: words.madeLead(memberName(row, member)),
      focus: (within) => rowOf(within, member)?.querySelector("button"),
    });
  const confirm = (membership: Membership) => {
    if (pending === undefined) return;
    const after = pending.kind === "add" ? added(pending.agent) : removed(row.conversation.agent);
    void apply(membership, after).then((done) => {
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
        history
          ? setPending({ kind: "add", agent })
          : void apply(withAgent(row, agent.id), added(agent)),
      (error: unknown) => {
        failed(error);
        setFailure(words.failed(failureReason(undefined, source)));
      },
    );
  };
  const remove = (member: MessagingId) => {
    if (member !== row.conversation.agent) {
      return void apply(withoutAgent(row, member), removed(member));
    }
    setPending({ kind: "remove-lead", lead: memberName(row, member) });
  };
  return { pending, failure, busy, makeLead, confirm, cancel, add, remove };
}

/** Whether the row the page read again already shows `membership`. */
function shows(row: ConversationRow, membership: Membership): boolean {
  const members = membersOf(row);
  return (
    row.conversation.agent === membership.lead &&
    members.length === membership.members.length &&
    membership.members.every((member) => members.includes(member))
  );
}

/** A member's row in the panel. */
function rowOf(panel: HTMLElement, member: MessagingId): HTMLElement | undefined {
  return [...panel.querySelectorAll<HTMLElement>("[data-member]")].find(
    (each) => each.getAttribute("data-member") === member,
  );
}

/** The button under `within` whose text is `label`. */
function buttonNamed(within: HTMLElement | undefined, label: string): HTMLElement | undefined {
  return [...(within?.querySelectorAll<HTMLElement>("button") ?? [])].find(
    (each) => each.textContent === label,
  );
}
