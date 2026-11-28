import { Dialog, Field, Input, useOpenSignIn } from "@halonicjs/studio-kit";
import type { AgentConnection, AgentConnections } from "@halonicjs/studio-services";
import { useEffect, useRef, useState } from "react";
import * as words from "../connections-words.ts";
import { EndedStep, useLeftMs, WaitingStep } from "./connect-steps.tsx";
import {
  type EndedResult,
  type SignIn,
  type SignInView,
  type StartProblem,
  useSignIn,
} from "./sign-in-flow.ts";

/** The props of {@link ConnectDialog}. */
export interface ConnectDialogProps {
  readonly connections: AgentConnections;
  /** The signed-out connection, or one this computer holds no key for, to sign in to; none for a new one. */
  readonly again?: AgentConnection | undefined;
  /** The connected connection to add another account beside, at its address. */
  readonly another?: AgentConnection | undefined;
  /** Runs once the dialog has cancelled its sign-in; the opener unmounts it. */
  readonly onClose: () => void;
  /** Runs once the sign-in connected `connection`; the opener unmounts the dialog and says so. */
  readonly onConnected: (connection: AgentConnection) => void;
  /** Runs after `onClose` when the engine failed to cancel the sign-in, so the opener can say so. */
  readonly onCancelFailed: () => void;
  /** Where the countdown counts from. Default the clock. */
  readonly now?: () => number;
}

const thisComputer = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Whether the engine could sign in or pair at `address`: https, or plain http on this computer only. */
export function isAllowedAddress(address: string): boolean {
  try {
    const url = new URL(address);
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && thisComputer.has(url.hostname);
  } catch {
    return false;
  }
}

/**
 * The origin of the connection's address, which its approval page is on (`kit.open-sign-in`).
 * The address was checked before the sign-in started; should it still not parse, the origin is
 * empty, which the desktop shell refuses and reports, and the page opens as every other link.
 */
function originOf(address: string): string {
  try {
    return new URL(address).origin;
  } catch {
    return "";
  }
}

/** The dialog's title: Connect Paperclip, Sign in, Sign in again or Add another account. */
function titleOf(props: ConnectDialogProps): string {
  if (props.again?.state.kind === "no-key") return words.SIGN_IN;
  if (props.again !== undefined) return words.SIGN_IN_AGAIN;
  if (props.another !== undefined) return words.ADD_ACCOUNT;
  return words.CONNECT;
}

/** The line above the address field, for the title the dialog has. */
function leadOf(props: ConnectDialogProps): string {
  if (props.again?.state.kind === "no-key") return words.signInNoKeyLead(props.again.label);
  if (props.again !== undefined) return words.signInAgainLead(props.again.label);
  if (props.another !== undefined) return words.ADD_ACCOUNT_LEAD;
  return words.CONNECT_LEAD;
}

/** The field's error for a refused start; an engine that didn't answer goes to the Dialog's alert. */
function fieldProblem(problem: StartProblem | undefined): string | undefined {
  switch (problem) {
    case undefined:
    case "failed":
      return undefined;
    case "unreachable":
      return words.ADDRESS_UNREACHABLE;
    case "address-not-allowed":
      return words.ADDRESS_NOT_PAPERCLIP;
    case "too-many-sign-ins":
      return words.TOO_MANY_SIGN_INS;
    case "other-company":
      return words.companyMismatch(undefined).text;
  }
}

/**
 * How the sign-in ended, if it has: as the engine said, or expired once its 10 minutes ran out on
 * this clock, for the one draw before the sign-in hears of it.
 */
function endedOf(view: SignInView, leftMs: number): EndedResult | undefined {
  if (view.stage === "ended") return view.result;
  if (view.stage === "waiting" && leftMs <= 0) return { outcome: "expired" };
  return undefined;
}

/**
 * Connect Paperclip, or Sign in again for a signed-out connection (`connections.connect-dialog`),
 * or Add another account on a connected one's Paperclip (`connections.add-account`).
 * It asks for the address the board opens Paperclip at, starts a sign-in there and opens the
 * approval page, then shows the words the page shows too and the 10 minutes left to approve.
 * Closing it cancels a waiting sign-in, silently; once approved the opener closes it.
 */
export function ConnectDialog(props: ConnectDialogProps) {
  const { connections, again, another, onClose, onConnected } = props;
  const signIn = useSignIn(connections, again?.id, another !== undefined);
  const title = titleOf(props);
  // Kept here, so Start again shows the address the last sign-in went to.
  const [address, setAddress] = useState(again?.address ?? another?.address ?? "");
  const view = signIn.view;
  const leftMs = useLeftMs(view.stage === "waiting" ? view.challenge : undefined, props.now);

  // Out of time here first: end the sign-in, so Start again and Close don't act on it.
  const timedOut = view.stage === "waiting" && leftMs <= 0;
  const { expire } = signIn;
  useEffect(() => {
    if (timedOut) expire();
  }, [timedOut, expire]);

  // The Settings row says Connected; the dialog has nothing left to say.
  const connected = view.stage === "connected" ? view.connection : undefined;
  useEffect(() => {
    if (connected !== undefined) onConnected(connected);
  }, [connected, onConnected]);

  // The dialog goes either way; a failed cancel is said by the opener, which stays on screen.
  const close = () => {
    signIn.cancel().then(onClose, () => {
      onClose();
      props.onCancelFailed();
    });
  };

  if (view.stage === "address" || view.stage === "starting") {
    return (
      <AddressStep
        title={title}
        lead={leadOf(props)}
        fixedAddress={again !== undefined || another !== undefined}
        signIn={signIn}
        address={address}
        onAddressChange={setAddress}
        problem={view.stage === "address" ? view.problem : undefined}
        busy={view.stage === "starting"}
        onClose={close}
      />
    );
  }
  const ended = endedOf(view, leftMs);
  if (ended !== undefined) {
    return <EndedStep title={title} result={ended} onClose={close} onStartAgain={signIn.again} />;
  }
  if (view.stage === "waiting") {
    return (
      <WaitingStep
        title={title}
        challenge={view.challenge}
        origin={originOf(address.trim())}
        leftMs={leftMs}
        onCancel={close}
      />
    );
  }
  return null;
}

/** The address field, with Continue, which starts the sign-in and opens the approval page. */
function AddressStep({
  title,
  lead,
  fixedAddress,
  signIn,
  address,
  onAddressChange,
  problem,
  busy,
  onClose,
}: {
  readonly title: string;
  readonly lead: string;
  /** The connection's own address, read-only: Sign in again and Add another account. */
  readonly fixedAddress: boolean;
  readonly signIn: SignIn;
  readonly address: string;
  readonly onAddressChange: (address: string) => void;
  readonly problem: StartProblem | undefined;
  readonly busy: boolean;
  readonly onClose: () => void;
}) {
  const [invalid, setInvalid] = useState(false);
  const openSignIn = useOpenSignIn();
  const fieldError = invalid ? words.ADDRESS_HTTPS_ONLY : fieldProblem(problem);
  const input = useRef<HTMLInputElement>(null);

  // The kit's Dialog contract: an error on the field takes focus to the field, off Continue. The
  // engine's refusal comes later, once the sign-in didn't start.
  useEffect(() => {
    if (fieldProblem(problem) !== undefined) input.current?.focus();
  }, [problem]);

  const start = () => {
    const trimmed = address.trim();
    if (!isAllowedAddress(trimmed)) {
      setInvalid(true);
      input.current?.focus();
      return;
    }
    setInvalid(false);
    // Opened inside the click, before anything is awaited, or a browser blocks the tab. When no
    // sign-in starts, the address never comes, the tab closes, and the step says why.
    openSignIn(signIn.start(trimmed), originOf(trimmed)).catch(() => undefined);
  };

  return (
    <Dialog
      size="md"
      title={title}
      closeLabel={`Close ${title}`}
      form
      confirm={{ label: words.CONTINUE, busyLabel: words.STARTING }}
      busy={busy}
      onConfirm={start}
      onCancel={onClose}
      {...(problem === "failed" ? { error: words.START_FAILED } : {})}
    >
      <div className="flex flex-col gap-4">
        <p className="m-0 text-body text-fg">{lead}</p>
        <Field label={words.ADDRESS_LABEL} hint={words.ADDRESS_HINT} error={fieldError ?? null}>
          <Input
            ref={input}
            mono
            readOnly={busy || fixedAddress}
            value={address}
            placeholder={words.ADDRESS_PLACEHOLDER}
            onChange={(event) => onAddressChange(event.target.value)}
          />
        </Field>
      </div>
    </Dialog>
  );
}
