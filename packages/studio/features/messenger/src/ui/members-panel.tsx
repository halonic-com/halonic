import type { MessagingAgent, MessagingId } from "@halonicjs/ports";
import { Button, Dialog, Field, Menu, Select } from "@halonicjs/studio-kit";
import { useId, useState } from "react";
import {
  addable,
  canAdd,
  canRemove,
  type Membership,
  membersOf,
  withAgent,
  withLead,
  withoutAgent,
} from "../channel-admin.ts";
import { channelAdminWords } from "../channel-admin-words.ts";
import { channelWords } from "../channel-words.ts";
import type { ConversationRow, Messenger } from "../messenger.ts";
import { messengerWords } from "../messenger-words.ts";
import { type Pending, useMembers } from "./use-members.ts";

const words = channelAdminWords.members;

/** The props of {@link MembersPanel}. */
export interface MembersPanelProps {
  readonly messenger: Messenger;
  readonly row: ConversationRow;
}

/**
 * A channel's Members (flow H, render k12a; requirement `messenger.members`): each member with what
 * it is doing, the lead marked, **Make lead** and **Remove from channel**, and **Add an agent**.
 * Adding to a channel with messages first says the new member will read them, and `setMembers`
 * waits for **Add …** (Julian's M5). Removing the lead asks for a new lead first. A channel keeps 2
 * to 8 agents, so Remove and Add say why they can't be used outside that.
 */
export function MembersPanel({ messenger, row }: MembersPanelProps) {
  const tooFewId = useId();
  const members = membersOf(row);
  const source = row.source?.label ?? "";
  const { pending, failure, busy, change, confirm, cancel, add, remove } = useMembers(
    messenger,
    row,
  );

  return (
    <aside
      aria-label={words.title(members.length)}
      className="flex w-72 flex-col gap-2 border-s border-border p-3"
    >
      <h3 className="text-body-strong">{words.title(members.length)}</h3>
      <p className="text-small text-fg-muted">{words.hint(source)}</p>
      <p id={tooFewId} className="text-small text-fg-muted">
        {canRemove(row) ? "" : words.tooFewLeft}
      </p>
      <ul className="flex flex-col gap-2">
        {members.map((member) => (
          <MemberRow
            key={member}
            row={row}
            member={member}
            tooFewId={tooFewId}
            onMakeLead={() => change(withLead(row, member))}
            onRemove={() => remove(member)}
          />
        ))}
      </ul>
      <AddAgent row={row} onPick={add} />
      {failure === undefined || pending !== undefined ? null : (
        <p role="alert" className="text-small text-danger">
          {failure}
        </p>
      )}
      {pending === undefined ? null : (
        <PendingDialog
          row={row}
          pending={pending}
          busy={busy}
          failure={failure}
          onConfirm={confirm}
          onCancel={cancel}
        />
      )}
    </aside>
  );
}

function MemberRow({
  row,
  member,
  tooFewId,
  onMakeLead,
  onRemove,
}: {
  readonly row: ConversationRow;
  readonly member: MessagingId;
  readonly tooFewId: string;
  readonly onMakeLead: () => void;
  readonly onRemove: () => void;
}) {
  const agent = row.sourceAgents.find((each) => each.id === member);
  const isLead = member === row.conversation.agent;
  const name = agent?.name ?? channelWords.authorGone(row.source?.label ?? "");
  return (
    <li data-member={member} className="flex flex-col gap-1">
      <span className="text-body">
        <bdi>{name}</bdi>
        {isLead ? <span className="text-small text-fg-muted"> · {words.lead}</span> : null}
      </span>
      {agent === undefined ? null : (
        <span className="text-small text-fg-muted">{messengerWords.activity[agent.activity]}</span>
      )}
      <span className="flex gap-1">
        {isLead || agent === undefined ? null : (
          <Button size="sm" variant="ghost" onClick={onMakeLead}>
            {words.makeLead}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          unavailable={canRemove(row) ? undefined : { reason: tooFewId }}
          onClick={onRemove}
        >
          {words.remove}
        </Button>
      </span>
    </li>
  );
}

/** **Add an agent**: a menu of the source's agents not in the channel, while one more fits. */
function AddAgent({
  row,
  onPick,
}: {
  readonly row: ConversationRow;
  readonly onPick: (agent: MessagingAgent) => void;
}) {
  const fullId = useId();
  const choices = addable(row);
  if (choices.length === 0) return null;
  if (!canAdd(row)) {
    return (
      <>
        <Button size="sm" unavailable={{ reason: fullId }}>
          {words.add}
        </Button>
        <p id={fullId} className="text-small text-fg-muted">
          {channelAdminWords.tooMany}
        </p>
      </>
    );
  }
  return (
    <Menu
      trigger={(props) => (
        <Button {...props} size="sm">
          {words.add}
        </Button>
      )}
      entries={choices.map((agent) => ({
        id: agent.id,
        label: agent.name,
        onSelect: () => onPick(agent),
      }))}
    />
  );
}

/** The dialog a change waits in: the history notice before adding, or a new lead before removing. */
function PendingDialog({
  row,
  pending,
  busy,
  failure,
  onConfirm,
  onCancel,
}: {
  readonly row: ConversationRow;
  readonly pending: Pending;
  readonly busy: boolean;
  readonly failure: string | undefined;
  readonly onConfirm: (membership: Membership) => void;
  readonly onCancel: () => void;
}) {
  const others = row.agents.filter((agent) => agent.id !== row.conversation.agent);
  const [newLead, setNewLead] = useState<MessagingId>(others[0]?.id ?? "");
  const shared = {
    size: "sm",
    busy,
    retryLabel: channelAdminWords.tryAgain,
    ...(failure === undefined ? {} : { error: failure }),
    onCancel,
  } as const;
  if (pending.kind === "add") {
    const { agent } = pending;
    return (
      <Dialog
        {...shared}
        title={words.add}
        confirm={{ label: words.history.confirm(agent.name), busyLabel: words.busy }}
        onConfirm={() => onConfirm(withAgent(row, agent.id))}
      >
        <p className="text-body" data-history-notice>
          {words.history.line(agent.name, row.conversation.title)}
        </p>
      </Dialog>
    );
  }
  const removeLead = words.removeLead;
  return (
    <Dialog
      {...shared}
      title={removeLead.title(pending.lead)}
      confirm={{
        label: removeLead.confirm(pending.lead),
        variant: "danger",
        busyLabel: words.busy,
      }}
      onConfirm={() => onConfirm(withoutAgent(row, row.conversation.agent, newLead))}
    >
      <p className="text-body">{removeLead.line(pending.lead)}</p>
      <Field label={removeLead.newLead}>
        <Select
          options={others.map((agent) => ({ value: agent.id, label: agent.name }))}
          value={newLead}
          onChange={setNewLead}
        />
      </Field>
    </Dialog>
  );
}
