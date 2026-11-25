import type { MessagingAgent, MessagingId } from "@halonicjs/ports";
import { Button, type ChatComposerPicker, CloseIcon } from "@halonicjs/studio-kit";
import { useId, useState } from "react";
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
  /** The `@` picker, for the box: the members it offers while it's open. */
  readonly picker: ChatComposerPicker;
  /** With no member to offer: the source's agent whose name was typed, who could be added. */
  readonly outsider: MessagingAgent | undefined;
  unname(agent: MessagingId): void;
  /** Reads the picks again, as after a send cleared them. */
  refresh(): void;
}

/**
 * Names agents in a channel's box (flow I): typing `@` opens a picker of the members, filtered
 * by what follows; the kit's `ChatComposer` moves through it with ↑↓, and Enter or a click names
 * one, and Esc closes it. A named agent becomes a
 * chip and the `@name` leaves the text, and `say` reads the new To line out. Text that wasn't
 * picked stays text and names nobody (requirement `messenger.channel-authority`).
 */
export function useChannelAddress(
  messenger: Messenger,
  row: ConversationRow,
  draft: string,
  type: (text: string) => void,
  say: (text: string) => void,
): ChannelAddress {
  const id = row.conversation.id;
  const [named, setNamedState] = useState(() => messenger.named(id));
  // Esc closes the picker until the text changes.
  const [closedAt, setClosedAt] = useState<string | undefined>(undefined);
  const lineId = useId();
  const query = pickerQuery(draft);
  const open = isChannel(row) && query !== undefined && closedAt !== draft;
  const options = open ? pickable(row, query ?? "", named) : [];
  // Picking or removing someone says the new To line, as the chip appears silently (MS10).
  const setNamed = (agents: readonly MessagingId[]) => {
    messenger.setNamed(id, agents);
    setNamedState(agents);
    say(toLine(row, agents).text);
  };
  const pick = (agent: MessagingAgent) => {
    setNamed([...named, agent.id]);
    type(withoutQuery(draft));
  };
  return {
    named: named.flatMap((each) => row.agents.find((agent) => agent.id === each) ?? []),
    line: toLine(row, named),
    lineId,
    picker: {
      label: channelWords.picker,
      open,
      options: options.map((agent) => ({ id: agent.id, content: <MemberOption agent={agent} /> })),
      onPick(agentId) {
        const agent = options.find((each) => each.id === agentId);
        if (agent !== undefined) pick(agent);
      },
      onClose: () => setClosedAt(draft),
    },
    outsider: open && options.length === 0 ? outsider(row, query ?? "") : undefined,
    unname: (agent) => setNamed(named.filter((each) => each !== agent)),
    refresh: () => setNamedState(messenger.named(id)),
  };
}

/** A member's row in the picker: the name, then the title. */
function MemberOption({ agent }: { readonly agent: MessagingAgent }) {
  return (
    <>
      <bdi>{agent.name}</bdi>
      {agent.title === undefined ? null : (
        <span className="text-small text-fg-muted"> · {agent.title}</span>
      )}
    </>
  );
}

/**
 * The To line inside a channel's box, above the text, and an accent "@name" chip with Remove per
 * named agent (k10a, k10d). Remove takes its button away, so `onUnname` moves focus on (HAL-18316
 * MS9).
 */
export function ChannelAddressBar({
  address,
  onUnname,
}: {
  readonly address: ChannelAddress;
  readonly onUnname: (index: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small">
      <span data-to-line className="text-fg-muted">
        {address.line.text}
      </span>
      {address.line.waits === undefined ? null : (
        <span id={address.lineId}>{address.line.waits}</span>
      )}
      {address.named.map((agent, index) => (
        <span
          key={agent.id}
          data-chip
          className="flex items-center rounded-sm bg-accent-soft ps-1.5 text-accent-text"
        >
          <bdi>@{agent.name}</bdi>
          <Button
            variant="ghost"
            size="sm"
            icon={<CloseIcon />}
            label={channelWords.unname(agent.name)}
            onClick={() => onUnname(index)}
          />
        </span>
      ))}
    </div>
  );
}

/**
 * Above a channel's box, while the picker offers nobody: a name typed that is the source's agent
 * but not a member says so, with **Add Writer** (k10c). That goes through the Members panel's own
 * change, so the history notice comes first (`messenger.members`).
 */
export function ChannelNotMember({
  row,
  address,
  members,
}: {
  readonly row: ConversationRow;
  readonly address: ChannelAddress;
  readonly members: MemberChanges;
}) {
  const agent = address.outsider;
  return (
    <>
      {agent === undefined ? null : (
        <div data-not-member className="flex flex-col gap-1 text-small">
          <p className="flex flex-wrap items-center gap-2">
            <span>{channelWords.notMember(agent.name)}</span>
            <Button size="sm" variant="secondary" onClick={() => members.add(agent)}>
              {channelAdminWords.members.history.confirm(agent.name)}
            </Button>
          </p>
          <p className="text-fg-muted">{channelWords.onlyMembers}</p>
        </div>
      )}
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
    </>
  );
}
