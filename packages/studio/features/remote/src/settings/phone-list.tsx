import type { PairedPhone, RemoteControl, RemoteState } from "@halonicjs/ports";
import { Button, Dialog, EmptyState } from "@halonicjs/studio-kit";
import { sectionHeading } from "@halonicjs/studio-shell";
import { useId, useRef, useState } from "react";
import { pairedLine, seenLine } from "./phone-words.ts";
import * as text from "./remote-text.ts";

/** The props of {@link PhoneList}. */
export interface PhoneListProps {
  readonly remote: RemoteControl;
  readonly state: RemoteState;
  /** Says a result in the dialog: the settings container's live region. */
  readonly announce: (line: string) => void;
  /** Where "Last seen" counts from. Default the clock. */
  readonly now?: () => Date;
}

/** What the open Revoke dialog cuts off: one phone, or every one. */
type Revoking = { readonly phone: PairedPhone } | { readonly all: number };

/**
 * The paired phones (`remote.paired-phones`): a row per phone with what it is, when it paired,
 * what it can do and whether it is connected, and Revoke. Revoke all sits at the foot of the list
 * from two phones on. Both ask once and say what they cut. With no phone, the empty state; the
 * dialog stays over it until the last Revoke has finished, so focus has somewhere to go.
 */
export function PhoneList({ remote, state, announce, now = () => new Date() }: PhoneListProps) {
  const [revoking, setRevoking] = useState<Revoking>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const root = useRef<HTMLDivElement | null>(null);
  const revokeButtons = useRef(new Map<string, HTMLButtonElement>());
  // Where focus goes when the dialog closes after a Revoke: the next row's button, else the previous.
  const focusAfter = useRef<string | undefined>(undefined);

  const open = (next: Revoking) => {
    setError(undefined);
    setRevoking(next);
  };

  const confirm = async (target: Revoking) => {
    setBusy(true);
    setError(undefined);
    const one = "phone" in target ? target.phone : undefined;
    try {
      await (one === undefined ? remote.revokeAll() : remote.revoke(one.id));
    } catch {
      setBusy(false);
      setError(one === undefined ? text.REVOKE_ALL_FAILED : text.revokeFailed(one.name));
      return;
    }
    if (one !== undefined) {
      const index = state.phones.findIndex((phone) => phone.id === one.id);
      focusAfter.current = (state.phones[index + 1] ?? state.phones[index - 1])?.id;
    }
    setBusy(false);
    setRevoking(undefined);
    announce(one === undefined ? text.ALL_REVOKED : text.revoked(one.name));
  };

  return (
    <div ref={root}>
      {state.phones.length === 0 ? (
        <EmptyState
          title={text.EMPTY_TITLE}
          headingLevel={3}
          description={
            // The kit wraps the description in a paragraph, so its two lines are blocks, not paragraphs.
            <>
              <span className="block">{state.on ? text.EMPTY_LINE_ON : text.EMPTY_LINE_OFF}</span>
              <span className="block">{text.EMPTY_STAYS}</span>
            </>
          }
        />
      ) : (
        <Phones
          state={state}
          now={now()}
          buttons={revokeButtons.current}
          onRevoke={(phone) => open({ phone })}
          onRevokeAll={() => open({ all: state.phones.length })}
        />
      )}
      {revoking === undefined ? null : (
        <Dialog
          size="sm"
          title={
            "phone" in revoking
              ? text.revokeTitle(revoking.phone.name)
              : text.revokeAllTitle(revoking.all)
          }
          confirm={{
            label: "phone" in revoking ? text.REVOKE : text.REVOKE_ALL,
            variant: "danger",
            busyLabel: text.REVOKING,
          }}
          busy={busy}
          {...(error === undefined ? {} : { error })}
          returnFocus={() => {
            const next = focusAfter.current;
            focusAfter.current = undefined;
            return (next && revokeButtons.current.get(next)) || sectionHeading(root.current);
          }}
          onConfirm={() => void confirm(revoking)}
          onCancel={() => setRevoking(undefined)}
        >
          {"phone" in revoking ? (
            <>
              <p>{text.revokeLine(revoking.phone.name)}</p>
              <p>{text.REVOKE_AGAIN}</p>
            </>
          ) : (
            <>
              <p>{text.revokeAllLine(revoking.all)}</p>
              <p>{text.REVOKE_ALL_AGAIN}</p>
            </>
          )}
        </Dialog>
      )}
    </div>
  );
}

/** The list itself: its heading, a row per phone, and Revoke all from two phones on. */
function Phones({
  state,
  now,
  buttons,
  onRevoke,
  onRevokeAll,
}: {
  readonly state: RemoteState;
  readonly now: Date;
  /** Each row's Revoke button by phone id, for where focus goes after one. */
  readonly buttons: Map<string, HTMLButtonElement>;
  readonly onRevoke: (phone: PairedPhone) => void;
  readonly onRevokeAll: () => void;
}) {
  const headingId = useId();
  return (
    <div className="flex flex-col gap-2">
      <h3 id={headingId} className="text-body-strong">
        {text.phonesHeading(state.phones.length)}
      </h3>
      <ul
        aria-labelledby={headingId}
        className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border p-0"
      >
        {state.phones.map((phone) => (
          <li key={phone.id} className="flex items-center gap-4 px-4 py-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="text-fg">{phone.name}</p>
              <p className="text-small text-fg-muted">{pairedLine(phone, now)}</p>
              <p className="text-small text-fg-muted">{text.CAN}</p>
            </div>
            <span className="shrink-0 text-small text-fg-muted">
              {seenLine(phone, state.on, now)}
            </span>
            <Button
              variant="danger-outline"
              size="sm"
              ref={(node) => {
                if (node) buttons.set(phone.id, node);
                else buttons.delete(phone.id);
              }}
              onClick={() => onRevoke(phone)}
            >
              {text.REVOKE}
              {/* Names the phone for a screen reader, so each row's Revoke differs. */}
              <span className="sr-only"> {phone.name}</span>
            </Button>
          </li>
        ))}
      </ul>
      {state.phones.length >= 2 ? (
        <div className="flex justify-end">
          <Button variant="danger-outline" size="sm" onClick={onRevokeAll}>
            {text.REVOKE_ALL}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
