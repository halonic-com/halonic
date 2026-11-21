import { Button, Field, Input, SkeletonBar, StatusChip } from "@halonicjs/studio-kit";
import { type Ref, useEffect, useId, useState } from "react";
import type { KeyAddresses } from "../api.ts";
import { type ReadAddress, readAddress } from "./key-address.ts";
import {
  ADDRESS_HINT_BUILT_IN,
  ADDRESS_HINT_CUSTOM,
  ADDRESS_LABEL,
  ADDRESS_PLACEHOLDER,
  ADDRESS_PROBLEM,
  ADDRESS_UNENCRYPTED,
  ADDRESSES_RECOVERY,
  ADDRESSES_UNREADABLE,
  allowedAddressLine,
  moreAddresses,
  NOT_BOUND_YET,
} from "./key-text.ts";

/**
 * What the page knows about a stored key's addresses. `none`: a key saved before addresses
 * existed. `unreadable`: the list can't be read, which is never shown as `none`, since the model
 * resolver refuses such a key.
 */
export type AddressState =
  | { readonly kind: "checking" | "none" | "unreadable" }
  | { readonly kind: "listed"; readonly list: readonly string[] };

/**
 * The stored key's addresses, read when the key, its name or `attempt` changes. `undefined` when
 * there is nothing to read: no address service, no secret name or no key stored.
 */
export function useKeyAddresses(
  addresses: KeyAddresses | undefined,
  secretName: string | undefined,
  keyStored: boolean,
  attempt: number,
): AddressState | undefined {
  const [state, setState] = useState<AddressState>({ kind: "checking" });
  const reads = addresses !== undefined && secretName !== undefined && keyStored;
  useEffect(() => {
    if (!reads) return;
    let current = true;
    setState({ kind: "checking" });
    addresses.allowed(secretName).then(
      (list) =>
        current && setState(list === undefined ? { kind: "none" } : { kind: "listed", list }),
      () => current && setState({ kind: "unreadable" }),
    );
    return () => {
      current = false;
    };
  }, [reads, addresses, secretName, attempt]);
  return reads ? state : undefined;
}

/**
 * The stored key's addresses under its status: the first, with **+N more** opening the rest in
 * place; the quiet **Not bound yet** for an old key; or why they can't be read.
 */
export function AddressLine({
  state,
  secretName,
}: {
  readonly state: AddressState;
  readonly secretName: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  switch (state.kind) {
    case "checking":
      // As tall as the line it stands in for, so the block doesn't jump when the addresses come.
      return (
        <p aria-hidden="true" className="flex h-5 items-center">
          <SkeletonBar kind="meta" width="1/3" />
        </p>
      );
    case "none":
      return (
        <p>
          <StatusChip tone="neutral">{NOT_BOUND_YET}</StatusChip>
        </p>
      );
    case "unreadable":
      return (
        <div role="alert">
          <p>{ADDRESSES_UNREADABLE}</p>
          <p className="text-fg-muted">{ADDRESSES_RECOVERY}</p>
        </div>
      );
    case "listed": {
      const [first, ...more] = state.list;
      const words = moreAddresses(more.length, secretName);
      return (
        <div className="flex flex-col gap-1">
          <p className="flex flex-wrap items-center gap-2">
            <code className="break-all">{first}</code>
            {more.length === 0 ? null : (
              <Button
                variant="ghost"
                aria-expanded={open}
                aria-controls={listId}
                onClick={() => setOpen(!open)}
              >
                <span className="sr-only">{words.name}</span>
                <span aria-hidden="true">{words.shown}</span>
              </Button>
            )}
          </p>
          <ul id={listId} hidden={!open} className="flex flex-col gap-1">
            {more.map((address) => (
              <li key={address}>
                <code className="break-all">{address}</code>
              </li>
            ))}
          </ul>
        </div>
      );
    }
  }
}

/** The props of {@link AddressField}. */
export interface AddressFieldProps {
  readonly ref: Ref<HTMLInputElement>;
  /** The provider type's own address, pre-filled; `undefined` for a custom provider or another address. */
  readonly prefill: string | undefined;
  /** Whether Save needs an address: for a new key, not for one already stored. */
  readonly required: boolean;
  /** The error from the last Save, or the last time focus left the field. */
  readonly error: string | undefined;
  readonly readOnly: boolean;
  /** Called when focus leaves the field, with how its text reads. */
  readonly onLeave: (read: ReadAddress) => void;
}

/**
 * The Address field: a plain text field, pre-filled with the provider type's own address when it
 * has one. The line under it shows the address as it will be kept once focus leaves the field,
 * and notes plain `http` to another computer, which doesn't stop the save.
 */
export function AddressField({
  ref,
  prefill,
  required,
  error,
  readOnly,
  onLeave,
}: AddressFieldProps) {
  const [shown, setShown] = useState<ReadAddress | undefined>(
    prefill === undefined ? undefined : readAddress(prefill),
  );
  return (
    <div className="flex flex-col gap-1">
      <Field
        label={ADDRESS_LABEL}
        hint={prefill === undefined ? ADDRESS_HINT_CUSTOM : ADDRESS_HINT_BUILT_IN}
        error={error ?? null}
        required={required}
      >
        <Input
          ref={ref}
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          readOnly={readOnly}
          defaultValue={prefill}
          placeholder={prefill === undefined ? ADDRESS_PLACEHOLDER : undefined}
          onBlur={(event) => {
            const read = readAddress(event.target.value);
            setShown(read);
            onLeave(read);
          }}
        />
      </Field>
      <div aria-live="polite">
        {shown?.kind === "address" ? (
          <>
            <p>{allowedAddressLine(shown.address, shown.partDropped)}</p>
            {shown.unencrypted ? <p className="text-fg-muted">{ADDRESS_UNENCRYPTED}</p> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

/** The error for the typed text, or `undefined` when it reads as an address or may be left empty. */
export function addressError(read: ReadAddress, required: boolean): string | undefined {
  if (read.kind === "address") return undefined;
  if (read.problem === "empty" && !required) return undefined;
  return ADDRESS_PROBLEM[read.problem];
}
