import { Callout, Dialog, Field, Input, RadioGroup, Select } from "@halonicjs/studio-kit";
import { useRef, useState } from "react";
import { newConnectorErrors } from "../new-connector-check.ts";
import type { ConnectorRef, NewConnectorHost, NewConnectorWay } from "../new-connector-host.ts";
import { newConnectorWords } from "../new-connector-words.ts";

/** The props of {@link NewConnectorDialog}. */
export interface NewConnectorDialogProps {
  readonly host: NewConnectorHost;
  /** A name to start with, such as the missing connector a run banner names. */
  readonly name?: string;
  /** A way to start with, when it is known and the host offers it; nothing is guessed otherwise. */
  readonly way?: NewConnectorWay;
  /** After the connector is made: the caller opens its page. */
  readonly onCreated: (connector: ConnectorRef) => void;
  readonly onCancel: () => void;
  readonly returnFocus?: () => HTMLElement | null;
}

/** The reason without its closing full stop, so the sentence around it has one. */
function reasonOf(error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error);
  return reason.trim().replace(/\.$/, "");
}

/**
 * "New connector" (`library.new-connector`): Name, Hub (only with more than one), how it connects
 * and that way's field, an optional Secret, and the fixed line on what Create writes. **Create**
 * stays pressable while a field is empty and shows what is missing under it, the name first.
 * Nothing is connected or started.
 *
 * @example
 * <NewConnectorDialog host={host} onCreated={openConnector} onCancel={close} />
 */
export function NewConnectorDialog({
  host,
  name: startName = "",
  way: startWay,
  onCreated,
  onCancel,
  returnFocus,
}: NewConnectorDialogProps) {
  const hubs = host.hubs();
  const ways = host.ways();
  const [name, setName] = useState(startName);
  const [hub, setHub] = useState<string | null>(hubs[0]?.id ?? null);
  const [way, setWay] = useState<NewConnectorWay | null>(
    startWay !== undefined && ways.includes(startWay) ? startWay : null,
  );
  const [account, setAccount] = useState("");
  const [url, setUrl] = useState("");
  const [command, setCommand] = useState("");
  const [secret, setSecret] = useState("");
  const [asked, setAsked] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);
  const nameField = useRef<HTMLInputElement>(null);
  const wayField = useRef<HTMLInputElement>(null);
  const secretField = useRef<HTMLInputElement>(null);
  const wayChoice = useRef<HTMLDivElement>(null);
  const typed = { name, hub, way, account, url, command, secret: secret.trim() };
  const errors = newConnectorErrors(typed);

  async function create() {
    setAsked(true);
    setFailure(undefined);
    if (errors.name !== undefined) return nameField.current?.focus();
    if (typed.way === null) {
      wayChoice.current?.querySelector<HTMLInputElement>('input[type="radio"]')?.focus();
      return;
    }
    if (errors.account ?? errors.url ?? errors.command) return wayField.current?.focus();
    if (errors.secret !== undefined) return secretField.current?.focus();
    setBusy(true);
    try {
      onCreated(await host.create({ ...typed, way: typed.way }));
    } catch (error) {
      setFailure(newConnectorWords.failed(reasonOf(error)));
      setBusy(false);
    }
  }

  const shown = (message: string | undefined) => (asked ? (message ?? null) : null);
  const fieldOf = (picked: NewConnectorWay) => {
    switch (picked) {
      case "google":
        return (
          <Field label={newConnectorWords.account} error={shown(errors.account)}>
            <Input
              ref={wayField}
              disabled={busy}
              value={account}
              onChange={(event) => setAccount(event.target.value)}
            />
          </Field>
        );
      case "http":
        return (
          <Field label={newConnectorWords.url} error={shown(errors.url)}>
            <Input
              ref={wayField}
              disabled={busy}
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
          </Field>
        );
      case "stdio":
        return (
          <Field label={newConnectorWords.command} error={shown(errors.command)}>
            <Input
              ref={wayField}
              disabled={busy}
              value={command}
              onChange={(event) => setCommand(event.target.value)}
            />
          </Field>
        );
    }
  };
  const secretHint =
    way === "stdio" && secret.trim() !== "" && errors.secret === undefined
      ? newConnectorWords.secretPassed(secret.trim())
      : newConnectorWords.secretHint;

  return (
    <Dialog
      title={newConnectorWords.title}
      size="md"
      form
      confirm={{ label: newConnectorWords.create, busyLabel: newConnectorWords.creating }}
      busy={busy}
      {...(failure === undefined ? {} : { error: failure, retryLabel: newConnectorWords.retry })}
      onConfirm={() => void create()}
      onCancel={onCancel}
      {...(returnFocus === undefined ? {} : { returnFocus })}
    >
      <div className="flex flex-col gap-3">
        <Field
          label={newConnectorWords.name}
          hint={
            name.trim() === ""
              ? newConnectorWords.folder(host.file({ name, hub }))
              : newConnectorWords.file(host.file({ name, hub }))
          }
          error={shown(errors.name)}
        >
          <Input
            ref={nameField}
            autoFocus={startName === ""}
            disabled={busy}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        {hubs.length > 1 && (
          <Field label={newConnectorWords.hub}>
            <Select
              options={hubs.map((each) => ({ value: each.id, label: each.name }))}
              value={hub ?? ""}
              onChange={setHub}
            />
          </Field>
        )}
        <Field
          label={newConnectorWords.way}
          error={asked && way === null ? newConnectorWords.wayMissing : null}
        >
          <div ref={wayChoice}>
            <RadioGroup
              value={way}
              onChange={setWay}
              options={ways.map((each) => ({
                value: each,
                label: newConnectorWords.ways[each],
                field: fieldOf(each),
              }))}
            />
          </div>
        </Field>
        {way !== null && way !== "google" && (
          <Field label={newConnectorWords.secret} hint={secretHint} error={shown(errors.secret)}>
            <Input
              ref={secretField}
              disabled={busy}
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
            />
          </Field>
        )}
        {way !== null && (
          <Callout tone="info">
            {way === "google" ? newConnectorWords.googleAsksFirst : newConnectorWords.asksFirst}
          </Callout>
        )}
      </div>
    </Dialog>
  );
}
