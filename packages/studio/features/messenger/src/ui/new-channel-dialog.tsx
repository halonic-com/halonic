import { channelMembersMax, type MessagingId } from "@halonicjs/ports";
import { Checkbox, Dialog, Field, Input, Select } from "@halonicjs/studio-kit";
import { useEffect, useId, useState } from "react";
import { checkNewChannel, type SourceAgents } from "../channel-admin.ts";
import { channelAdminWords, failureReason } from "../channel-admin-words.ts";
import type { Messenger } from "../messenger.ts";

/** The props of {@link NewChannelDialog}. */
export interface NewChannelDialogProps {
  readonly messenger: Messenger;
  readonly onCancel: () => void;
  /** The channel was made; the page opens it. */
  readonly onCreated: (channel: MessagingId) => void;
}

const words = channelAdminWords.create;

/**
 * New channel (flow G, render k09b): a name, 2 to 8 agents of one source, and the lead who answers
 * when the person names nobody. **Create channel** stays off, with a line that says why, until the
 * channel can be made (requirement `messenger.channel-create`). The first agent picked fixes the
 * source; agents of other sources can't be picked then. With one source, it is fixed from the start.
 */
export function NewChannelDialog({ messenger, onCancel, onCreated }: NewChannelDialogProps) {
  const reasonId = useId();
  const fullId = useId();
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<readonly MessagingId[]>([]);
  const [lead, setLead] = useState<MessagingId | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const { sources, from, taken, unread } = useSources(messenger, picked);

  const check =
    from.source === undefined
      ? { blocked: words.tooFew, full: false }
      : checkNewChannel(
          { name, picked },
          { source: from.source, agents: from.agents ?? [] },
          taken,
        );
  const leadNow = lead !== undefined && picked.includes(lead) ? lead : picked[0];

  const submit = async () => {
    if (check.blocked !== undefined || leadNow === undefined || from.source === undefined) return;
    setBusy(true);
    setFailure(undefined);
    const result = await messenger.channels.start(name.trim(), picked, leadNow);
    setBusy(false);
    if (result.outcome === "done") return onCreated(result.conversation.id);
    setFailure(words.failed(failureReason(result, from.source.label, "start")));
  };

  const agentOptions = picked.map((id) => ({
    value: id,
    label: from.agents?.find((agent) => agent.id === id)?.name ?? "",
  }));
  return (
    <Dialog
      title={words.title}
      size="md"
      form
      confirm={{
        label: words.confirm,
        busyLabel: words.busy,
        ...(check.blocked === undefined ? {} : { unavailable: { reason: reasonId } }),
      }}
      retryLabel={channelAdminWords.tryAgain}
      busy={busy}
      {...(failure === undefined ? {} : { error: failure })}
      onConfirm={() =>
        void submit().catch((error: unknown) => {
          console.error("Starting the channel failed:", error);
          setBusy(false);
          setFailure(words.failed(failureReason(undefined, from.source?.label)));
        })
      }
      onCancel={onCancel}
    >
      <div className="flex flex-col gap-3">
        <p className="text-small text-fg-muted">{words.subtitle}</p>
        {unread === undefined ? null : (
          <p role="alert" className="text-small text-danger">
            {unread}
          </p>
        )}
        <Field label={words.name} error={check.nameTaken ?? null} required>
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <AgentPicker
          sources={sources}
          from={from}
          picked={picked}
          full={check.full}
          fullId={fullId}
          onPicked={setPicked}
        />
        <Field label={words.lead} hint={words.leadHint}>
          <Select options={agentOptions} value={leadNow ?? ""} onChange={setLead} />
        </Field>
        {check.full ? (
          <p id={fullId} className="text-small text-fg-muted">
            {channelAdminWords.tooMany} · {words.picked(picked.length, channelMembersMax)}
          </p>
        ) : null}
        <p id={reasonId} className="text-small text-fg-muted" data-create-reason>
          {check.blocked}
        </p>
      </div>
    </Dialog>
  );
}

/** The agents of every source, as checkboxes; only one source's, and at most 8, can be picked. */
function AgentPicker({
  sources,
  from,
  picked,
  full,
  fullId,
  onPicked,
}: {
  readonly sources: readonly SourceAgents[];
  readonly from: Partial<SourceAgents>;
  readonly picked: readonly MessagingId[];
  readonly full: boolean;
  /** The line that says 8 are picked. */
  readonly fullId: string;
  readonly onPicked: (picked: readonly MessagingId[]) => void;
}) {
  const sourceLineId = useId();
  const toggle = (agent: MessagingId, on: boolean) => {
    onPicked(on ? [...picked, agent] : picked.filter((each) => each !== agent));
  };
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-body-strong">{words.agents}</legend>
      {sources.length > 1 && picked.length > 0 && from.source !== undefined ? (
        <p id={sourceLineId} className="text-small text-fg-muted">
          {words.oneSource(from.source.label)}
        </p>
      ) : null}
      {sources.flatMap((each) =>
        each.agents.map((agent) => {
          const on = picked.includes(agent.id);
          // Before the first pick no source is fixed, so every source's agents can be picked.
          const otherSource = from.source !== undefined && each.source.id !== from.source.id;
          const closed = !on && (full || otherSource);
          return (
            <Checkbox
              key={agent.id}
              checked={on}
              onChange={(next) => toggle(agent.id, next)}
              unavailable={closed ? { reason: otherSource ? sourceLineId : fullId } : undefined}
            >
              <bdi>{agent.name}</bdi>
            </Checkbox>
          );
        }),
      )}
    </fieldset>
  );
}

/**
 * The sources and their agents, the source the first pick fixes (the only one, with one source;
 * none before a pick, with several), the names of that source's channels, and why a read failed.
 */
function useSources(messenger: Messenger, picked: readonly MessagingId[]) {
  const [sources, setSources] = useState<readonly SourceAgents[]>([]);
  const [taken, setTaken] = useState<readonly string[]>([]);
  const [unread, setUnread] = useState<string | undefined>(undefined);
  useEffect(() => {
    messenger.channels.sources().then(setSources, (error: unknown) => {
      console.error("New channel couldn't read the sources:", error);
      setUnread(words.unread);
    });
  }, [messenger]);
  const pickedFrom = sources.find((each) => each.agents.some((agent) => agent.id === picked[0]));
  const from: Partial<SourceAgents> = pickedFrom ?? (sources.length === 1 ? sources[0] : {}) ?? {};
  const sourceId = from.source?.id;
  useEffect(() => {
    if (sourceId === undefined) return;
    messenger.channels.takenNames(sourceId).then(setTaken, (error: unknown) => {
      console.error("New channel couldn't read the channels' names:", error);
      setUnread(channelAdminWords.browse.unread);
    });
  }, [messenger, sourceId]);
  return { sources, from, taken, unread };
}
