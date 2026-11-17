import { Button, Callout } from "@halonicjs/studio-kit";
import { failureLine } from "@halonicjs/studio-shell";
import { useEffect, useId, useRef, useState } from "react";
import { useNotAnswering } from "./not-answering.tsx";

/** Props for {@link WrongAccount}. */
export interface WrongAccountProps {
  /** When the last sign-in came back for another account, from the setup record. `null` for never or since cleared. */
  readonly at: string | null;
  /** The connector's address, which Google was asked to sign in. */
  readonly email: string;
  /** The address Google signed in instead, or `null` once the host has forgotten it. */
  readonly read: () => Promise<string | null>;
  /** Changes the connector's address to the one given. It rejects with a readable reason. */
  readonly changeAddress: (address: string) => Promise<void>;
  readonly answering: boolean;
}

/**
 * The note for a sign-in that came back for another account (design 3.5, item 3). The host keeps
 * the other address in memory for 10 minutes, so the note says it while it can, and otherwise says
 * only that the account didn't match. Nothing was saved either way: **Sign in again**, below, is
 * the way on, and the link changes the connector to the other address.
 */
export function WrongAccount({ at, email, read, changeAddress, answering }: WrongAccountProps) {
  // The address read for this `at`; `undefined` while reading, `null` when the host forgot it.
  const [signedInAs, setSignedInAs] = useState<{ at: string; address: string | null }>();
  const [problem, setProblem] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const notAnswering = useNotAnswering();
  const reason = useId();
  // The caller's `read` may be a new function each render; only a new `at` reads again.
  const reader = useRef(read);
  reader.current = read;

  useEffect(() => {
    if (at === null) return;
    let current = true;
    setProblem(null);
    reader.current().then(
      (address) => current && setSignedInAs({ at, address }),
      () => current && setSignedInAs({ at, address: null }),
    );
    return () => {
      current = false;
    };
  }, [at]);

  if (at === null || signedInAs?.at !== at) return null;
  const other = signedInAs.address;

  async function change(address: string) {
    setChanging(true);
    setProblem(null);
    try {
      await changeAddress(address);
    } catch (error) {
      setProblem(failureLine("change the connector's address", error));
    } finally {
      setChanging(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Callout tone="attention">
        <span className="flex flex-col items-start gap-1">
          {other === null
            ? `The sign-in didn't match this connector, so nothing was saved. Sign in again and choose ${email}.`
            : `You signed in as ${other}, but this connector is for ${email}. Sign in again and choose ${email}.`}
          {other === null ? null : (
            <Button
              variant="ghost"
              size="sm"
              busy={changing}
              unavailable={answering ? undefined : { reason }}
              onClick={() => void change(other)}
            >
              Use {other} for this connector instead
            </Button>
          )}
        </span>
      </Callout>
      {answering || other === null ? null : (
        <p id={reason} className="text-small text-fg-muted">
          {notAnswering}
        </p>
      )}
      {problem === null ? null : <Callout tone="danger">{problem}</Callout>}
    </div>
  );
}
