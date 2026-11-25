import type { MessagingAgent, MessagingId } from "@halonicjs/ports";
import { Button, CloseIcon } from "@halonicjs/studio-kit";
import { type KeyboardEvent, useId, useState } from "react";
import {
  isChannel,
  outsider,
  pickable,
  pickerQuery,
  type ToLine,
  toLine,
  withoutQuery,
} from "../channel.ts";
import { channelAdminWords } from "../channel-admin-words.ts";
import { channelWords } from "../channel-words.ts";
import type { ConversationRow, Messenger } from "../messenger.ts";
import { PendingDialog } from "./members-panel.tsx";
import type { MemberChanges } from "./use-members.ts";

/** What a channel's box needs to name agents: the picks, the picker and the To line. */
export interface ChannelAddress {
  readonly named: readonly MessagingAgent[];
  readonly line: ToLine;
  /** The `id` of the line saying why Send waits, so Send can point at it. */
  readonly lineId: string;
  /** The members the open picker offers; none while it's closed. */
  readonly options: readonly MessagingAgent[];
  readonly open: boolean;
  /** With no member to offer: the source's agent whose name was typed, who could be added. */
  readonly outsider: MessagingAgent | undefined;
  readonly active: number;
  pick(agent: MessagingAgent): void;
  unname(agent: MessagingId): void;
  /** Reads the picks again, as after a send cleared them. */
  refresh(): void;
  /** The picker's keys, caught before the box's own Enter sends. */
  onKeyDownCapture(event: KeyboardEvent): void;
}

/**
 * Names agents in a channel's box (flow I): typing `@` opens a picker of the members, filtered
 * by what follows; ↑↓ move, Enter or a click names one, and Esc closes it. A named agent becomes a
 * chip and the `@name` leaves the text. Text that wasn't picked stays text and names nobody
 * (requirement `messenger.channel-authority`).
 */
export function useChannelAddress(
  messenger: Messenger,
  row: ConversationRow,
  draft: string,
  type: (text: string) => void,
): ChannelAddress {
  const id = row.conversation.id;
  const [named, setNamedState] = useState(() => messenger.named(id));
  const [active, setActive] = useState(0);
  // Esc closes the picker until the text changes.
  const [closedAt, setClosedAt] = useState<string | undefined>(undefined);
  const lineId = useId();
  const query = pickerQuery(draft);
  const open = isChannel(row) && query !== undefined && closedAt !== draft;
  const options = open ? pickable(row, query ?? "", named) : [];
  const setNamed = (agents: readonly MessagingId[]) => {
    messenger.setNamed(id, agents);
    setNamedState(agents);
  };
  const pick = (agent: MessagingAgent) => {
    setNamed([...named, agent.id]);
    type(withoutQuery(draft));
    setActive(0);
  };
  return {
    named: named.flatMap((each) => row.agents.find((agent) => agent.id === each) ?? []),
    line: toLine(row, named),
    lineId,
    options,
    open,
    outsider: open && options.length === 0 ? outsider(row, query ?? "") : undefined,
    active: Math.min(active, Math.max(0, options.length - 1)),
    pick,
    unname: (agent) => setNamed(named.filter((each) => each !== agent)),
    refresh: () => setNamedState(messenger.named(id)),
    onKeyDownCapture(event) {
      if (!open) return;
      const count = Math.max(1, options.length);
      const chosen = options[Math.min(active, options.length - 1)];
      if (event.key === "ArrowDown") setActive((active + 1) % count);
      else if (event.key === "ArrowUp") setActive((active - 1 + count) % count);
      else if (event.key === "Escape") setClosedAt(draft);
      else if (event.key === "Enter" && !event.shiftKey && chosen !== undefined) pick(chosen);
      // Any other key, and Enter with nobody to pick, goes on to the box.
      else return;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}

/**
 * The picker above a channel's box, the To line, and a chip with Remove per named agent. A name
 * typed that is the source's agent but not a member says so, with **Add Writer**: that goes
 * through the Members panel's own change, so the history notice comes first (`messenger.members`).
 */
export function ChannelAddressBar({
  row,
  address,
  members,
}: {
  readonly row: ConversationRow;
  readonly address: ChannelAddress;
  readonly members: MemberChanges;
}) {
  return (
    <div className="flex flex-col gap-1">
      {address.open ? (
        <div data-member-picker className="rounded-md border border-border p-1">
          <p className="px-2 text-small text-fg-muted">{channelWords.picker}</p>
          {address.outsider === undefined ? null : (
            <NotMember agent={address.outsider} onAdd={members.add} />
          )}
          <ul className="flex flex-col">
            {address.options.map((agent, index) => (
              <li key={agent.id}>
                <button
                  type="button"
                  aria-current={index === address.active ? "true" : undefined}
                  onClick={() => address.pick(agent)}
                  className="w-full rounded-md px-2 py-1 text-start focus-ring aria-[current=true]:bg-surface-muted"
                >
                  <bdi>{agent.name}</bdi>
                  {agent.title === undefined ? null : (
                    <span className="text-small text-fg-muted"> · {agent.title}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 text-small">
        <span data-to-line className="text-fg-muted">
          {address.line.text}
        </span>
        {address.line.waits === undefined ? null : (
          <span id={address.lineId}>{address.line.waits}</span>
        )}
        {address.named.map((agent) => (
          <span
            key={agent.id}
            className="flex items-center gap-1 rounded-md border border-border py-0.5 ps-2"
          >
            <bdi>{agent.name}</bdi>
            <Button
              variant="ghost"
              size="sm"
              icon={<CloseIcon />}
              label={channelWords.unname(agent.name)}
              onClick={() => address.unname(agent.id)}
            />
          </span>
        ))}
      </div>
      {members.failure === undefined || members.pending !== undefined ? null : (
        <p role="alert" className="text-small text-danger">
          {members.failure}
        </p>
      )}
      {members.pending === undefined ? null : (
        <PendingDialog
          row={row}
          pending={members.pending}
          busy={members.busy}
          failure={members.failure}
          onConfirm={members.confirm}
          onCancel={members.cancel}
        />
      )}
    </div>
  );
}

/** "Writer isn't in this channel." with **Add Writer**, and "Only members can be named here." */
function NotMember({
  agent,
  onAdd,
}: {
  readonly agent: MessagingAgent;
  readonly onAdd: (agent: MessagingAgent) => void;
}) {
  return (
    <div data-not-member className="flex flex-col gap-1 px-2 py-1">
      <p className="flex flex-wrap items-center gap-2 text-small">
        <span>{channelWords.notMember(agent.name)}</span>
        <Button size="sm" variant="secondary" onClick={() => onAdd(agent)}>
          {channelAdminWords.members.history.confirm(agent.name)}
        </Button>
      </p>
      <p className="text-small text-fg-muted">{channelWords.onlyMembers}</p>
    </div>
  );
}
