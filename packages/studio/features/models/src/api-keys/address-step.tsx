import { Button } from "@halonicjs/studio-kit";
import { type ReactNode, useRef, useState } from "react";
import type { KeyAddresses } from "../api.ts";
import { readAddress } from "./key-address.ts";
import { AddressField, AddressLine, addressError, useKeyAddresses } from "./key-addresses.tsx";
import { AddressRefused } from "./key-save.ts";
import {
  ADD_ANOTHER_ADDRESS,
  ADDRESS_PROBLEM,
  ADDRESSES_FULL,
  NOT_BOUND_NOTICE,
} from "./key-text.ts";

/** What the key block knows about the stored key; `unknown` after a failed check. */
export type Stored = "checking" | "set" | "none" | "unknown";

/** The props of {@link useAddressStep}. */
export interface AddressStepInput {
  readonly addresses: KeyAddresses | undefined;
  readonly secretName: string | undefined;
  readonly stored: Stored;
  /** The provider type's own address, pre-filled for a new or old key. */
  readonly usualAddress: string | undefined;
  readonly busy: boolean;
}

/** The key block's address part: what it shows, and what its Save asks of it. */
export interface AddressStep {
  /** The addresses under the key's status, and **Add another address**; `null` when there are none to show. */
  readonly summary: ReactNode;
  /** The Address field inside the form, with the old key's notice; `null` when no address is asked. */
  readonly field: ReactNode;
  /** The typed address as it will be kept; `undefined` when none is asked, typed or readable. */
  typed(): string | undefined;
  /** Checks the field for Save. On a problem it shows it, focuses the field and answers `false`. */
  checked(): boolean;
  /** Reads the addresses again after a save kept one, and hides the field it opened. */
  kept(): void;
  /** The line for an address the key store refused, also shown under the field; `undefined` for other failures. */
  refused(error: unknown): string | undefined;
}

/**
 * The address part of the key block (`models.api-keys.address-field`, `models.api-keys.not-bound-yet`).
 * A new key needs an address. An old key with none, and **Add another address**, take one but
 * don't need it, so nothing is forced on a key that works today.
 */
export function useAddressStep({
  addresses,
  secretName,
  stored,
  usualAddress,
  busy,
}: AddressStepInput): AddressStep {
  const input = useRef<HTMLInputElement>(null);
  const [reads, setReads] = useState(0);
  const [adding, setAdding] = useState(false);
  const [problem, setProblem] = useState<string>();
  const state = useKeyAddresses(addresses, secretName, stored === "set", reads);
  const required = stored !== "set";
  const listed = state?.kind === "listed";
  const asks =
    addresses !== undefined &&
    (stored === "none" || stored === "unknown" || state?.kind === "none" || (listed && adding));
  const typedRead = () => readAddress(input.current?.value ?? "");

  const summary =
    state === undefined || secretName === undefined ? null : (
      <>
        <AddressLine state={state} secretName={secretName} />
        {listed && !adding ? (
          <p>
            <Button variant="ghost" onClick={() => setAdding(true)}>
              {ADD_ANOTHER_ADDRESS}
            </Button>
          </p>
        ) : null}
      </>
    );
  const field = asks ? (
    <div className="flex basis-full flex-col gap-2">
      {state?.kind === "none" ? <p>{NOT_BOUND_NOTICE}</p> : null}
      <AddressField
        ref={input}
        prefill={listed ? undefined : usualAddress}
        required={required}
        error={problem}
        readOnly={busy}
        onLeave={(read) => setProblem(addressError(read, required))}
      />
    </div>
  ) : null;

  return {
    summary,
    field,
    typed() {
      if (!asks) return undefined;
      const read = typedRead();
      return read.kind === "address" ? read.address : undefined;
    },
    checked() {
      if (!asks) return true;
      const wrong = addressError(typedRead(), required);
      setProblem(wrong);
      if (wrong !== undefined) input.current?.focus();
      return wrong === undefined;
    },
    kept() {
      setAdding(false);
      setReads((count) => count + 1);
    },
    refused(error) {
      if (!(error instanceof AddressRefused)) return undefined;
      const { answer } = error;
      if (answer.result === "full") return ADDRESSES_FULL;
      if (answer.result !== "bad-address") return undefined;
      const line =
        ADDRESS_PROBLEM[answer.problem === "has-user-info" ? "user-info" : "not-an-address"];
      setProblem(line);
      return line;
    },
  };
}
