import { Dialog, Field, Input, Select } from "@halonicjs/studio-kit";
import { useRef, useState } from "react";
import type { CollectionRef } from "../collection-host.ts";
import type { NewCollectionHost } from "../new-collection-host.ts";
import { newCollectionWords } from "../new-collection-words.ts";

/** The props of {@link NewCollectionDialog}. */
export interface NewCollectionDialogProps {
  readonly host: NewCollectionHost;
  /** After the collection is made: the caller opens its page. */
  readonly onCreated: (collection: CollectionRef) => void;
  readonly onCancel: () => void;
  readonly returnFocus?: () => HTMLElement | null;
}

/** The reason without its closing full stop, so the sentence around it has one. */
function reasonOf(error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error);
  return reason.trim().replace(/\.$/, "");
}

/**
 * "New collection" (`library.new-collection`): Name and Hub (only with more than one), with the
 * collection's file under Name. **Create** stays pressable while Name is empty and shows what is
 * missing under it.
 *
 * @example
 * <NewCollectionDialog host={host} onCreated={openCollection} onCancel={close} />
 */
export function NewCollectionDialog({
  host,
  onCreated,
  onCancel,
  returnFocus,
}: NewCollectionDialogProps) {
  const hubs = host.hubs();
  const [name, setName] = useState("");
  const [hub, setHub] = useState<string | null>(hubs[0]?.id ?? null);
  const [asked, setAsked] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);
  const nameField = useRef<HTMLInputElement>(null);
  const draft = { name, hub };

  async function create() {
    setAsked(true);
    setFailure(undefined);
    if (name.trim() === "") return nameField.current?.focus();
    setBusy(true);
    try {
      onCreated(await host.create(draft));
    } catch (error) {
      setFailure(newCollectionWords.failed(reasonOf(error)));
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={newCollectionWords.title}
      size="md"
      form
      confirm={{ label: newCollectionWords.create, busyLabel: newCollectionWords.creating }}
      busy={busy}
      {...(failure === undefined ? {} : { error: failure, retryLabel: newCollectionWords.retry })}
      onConfirm={() => void create()}
      onCancel={onCancel}
      {...(returnFocus === undefined ? {} : { returnFocus })}
    >
      <div className="flex flex-col gap-3">
        <Field
          label={newCollectionWords.name}
          hint={newCollectionWords.file(host.file(draft))}
          error={asked && name.trim() === "" ? newCollectionWords.nameMissing : null}
        >
          <Input
            ref={nameField}
            autoFocus
            disabled={busy}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        {hubs.length > 1 && (
          <Field label={newCollectionWords.hub}>
            <Select
              options={hubs.map((each) => ({ value: each.id, label: each.name }))}
              value={hub ?? ""}
              onChange={setHub}
            />
          </Field>
        )}
      </div>
    </Dialog>
  );
}
