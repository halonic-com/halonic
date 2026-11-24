import { Dialog, Field, Input, useOpenExternal } from "@halonicjs/studio-kit";
import type { AgentConnection, AgentConnections } from "@halonicjs/studio-services";
import { useState } from "react";
import * as words from "../connections-words.ts";
import { ConnectedStep, EndedStep, WaitingStep } from "./connect-steps.tsx";
import { type SignIn, type StartProblem, useSignIn } from "./sign-in-flow.ts";

/** The props of {@link ConnectDialog}. */
export interface ConnectDialogProps {
  readonly connections: AgentConnections;
  /** The signed-out connection to sign in again, or none for a new one. */
  readonly again?: AgentConnection | undefined;
  /** Runs once the dialog has cancelled its sign-in; the opener unmounts it. */
  readonly onClose: () => void;
  /** Runs after `onClose` when the engine failed to cancel the sign-in, so the opener can say so. */
  readonly onCancelFailed: () => void;
  /** Where the countdown counts from. Default the clock. */
  readonly now?: () => number;
}

/** Whether `address` is a web address the engine could sign in at. The engine checks it again. */
function isWebAddress(address: string): boolean {
  try {
    const url = new URL(address);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** The address step's error line: a refusal's title and line, or that nothing answered. */
function problemLine(problem: StartProblem | undefined): string | undefined {
  if (problem === undefined) return undefined;
  if (problem === "failed") return words.START_FAILED;
  const refusal = words.refusals[problem];
  return `${refusal.title}. ${refusal.line}`;
}

/**
 * Connect Paperclip, or Sign in again for a signed-out connection (`connections.connect-dialog`).
 * It asks for the address the board opens Paperclip at, starts a sign-in there and opens the
 * approval page, then shows the words the page shows too and the 10 minutes left to approve.
 * Closing it cancels a waiting sign-in.
 */
export function ConnectDialog(props: ConnectDialogProps) {
  const { connections, again } = props;
  const signIn = useSignIn(connections, again?.id);
  const title = again === undefined ? words.CONNECT : words.SIGN_IN_AGAIN;
  // Kept here, so Start again shows the address the last sign-in went to.
  const [address, setAddress] = useState(again?.address ?? "");

  // The dialog goes either way; a failed cancel is said by the opener, which stays on screen.
  const close = () => {
    signIn.cancel().then(props.onClose, () => {
      props.onClose();
      props.onCancelFailed();
    });
  };

  const view = signIn.view;
  if (view.stage === "address" || view.stage === "starting") {
    return (
      <AddressStep
        title={title}
        signIn={signIn}
        address={address}
        onAddressChange={setAddress}
        problem={view.stage === "address" ? view.problem : undefined}
        busy={view.stage === "starting"}
        onClose={close}
      />
    );
  }
  return (
    <Dialog size="md" title={title} closeLabel={`Close ${title}`} onCancel={close}>
      {view.stage === "waiting" ? (
        <WaitingStep
          challenge={view.challenge}
          now={props.now ?? Date.now}
          onCancel={close}
          onStartAgain={signIn.again}
        />
      ) : null}
      {view.stage === "ended" ? (
        <EndedStep result={view.result} challenge={view.challenge} onStartAgain={signIn.again} />
      ) : null}
      {view.stage === "connected" ? (
        <ConnectedStep connection={view.connection} onDone={props.onClose} />
      ) : null}
    </Dialog>
  );
}

/** The address field, with Connect, which starts the sign-in and opens the approval page. */
function AddressStep({
  title,
  signIn,
  address,
  onAddressChange,
  problem,
  busy,
  onClose,
}: {
  readonly title: string;
  readonly signIn: SignIn;
  readonly address: string;
  readonly onAddressChange: (address: string) => void;
  readonly problem: StartProblem | undefined;
  readonly busy: boolean;
  readonly onClose: () => void;
}) {
  const [invalid, setInvalid] = useState(false);
  const openExternal = useOpenExternal();
  const error = problemLine(problem);

  const connect = () => {
    const trimmed = address.trim();
    if (!isWebAddress(trimmed)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    // Opened inside the click, before anything is awaited, or a browser blocks the tab. When no
    // sign-in starts, the address never comes, the tab closes, and the step says why.
    openExternal(signIn.start(trimmed)).catch(() => undefined);
  };

  return (
    <Dialog
      size="md"
      title={title}
      closeLabel={`Close ${title}`}
      form
      confirm={{ label: words.START, busyLabel: words.STARTING }}
      busy={busy}
      onConfirm={connect}
      onCancel={onClose}
      {...(error === undefined ? {} : { error })}
    >
      <AddressField
        address={address}
        invalid={invalid}
        busy={busy}
        onAddressChange={onAddressChange}
      />
    </Dialog>
  );
}

/** The address field, with its hint and its error. */
function AddressField({
  address,
  invalid,
  busy,
  onAddressChange,
}: {
  readonly address: string;
  readonly invalid: boolean;
  readonly busy: boolean;
  readonly onAddressChange: (address: string) => void;
}) {
  return (
    <Field
      label={words.ADDRESS_LABEL}
      hint={words.ADDRESS_HINT}
      error={invalid ? words.ADDRESS_INVALID : null}
    >
      <Input
        mono
        readOnly={busy}
        value={address}
        placeholder={words.ADDRESS_PLACEHOLDER}
        onChange={(event) => onAddressChange(event.target.value)}
      />
    </Field>
  );
}
