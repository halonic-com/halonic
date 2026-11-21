import type { RemoteControl } from "@halonicjs/ports";
import { Dialog } from "@halonicjs/studio-kit";
import { useState } from "react";
import { type CheckEvent, type PairingView, usePairing } from "./pairing-flow.ts";
import { CheckStep, CodeStep, EndedStep, FailedStep, PairedStep } from "./pairing-steps.tsx";
import * as words from "./pairing-words.ts";

/** The props of {@link PairDialog}. */
export interface PairDialogProps {
  readonly remote: RemoteControl;
  /** The tunnel provider's id, for "Reached through Tailscale" and its reasons. */
  readonly provider: string;
  /** Whether phones may answer risky approvals, for what a new phone can do. */
  readonly allowRisky: boolean;
  /** Runs once the dialog has closed its pairing; the opener unmounts it. */
  readonly onClose: () => void;
  /** Runs after `onClose` when the host failed to end the pairing, so the opener can say so. */
  readonly onCloseFailed: () => void;
  /** Opens a provider's web page, such as "Open Tailscale setup". */
  readonly openExternal: (url: string) => void;
  /** Where the timer counts from. Default the clock. */
  readonly now?: () => number;
}

/**
 * Pair a phone (`remote.pair-a-phone`): it opens a pairing while it is open, which turns remote
 * on, and closing it ends the pairing, which turns remote off again when no phone is paired
 * (decisions 1 and 10). One dialog walks through the steps, so focus stays inside it: the code to
 * scan or type, Check the code with Allow, Paired, and what went wrong.
 */
export function PairDialog(props: PairDialogProps) {
  const pairing = usePairing(props.remote);
  const [busy, setBusy] = useState(false);
  // A failed answer belongs to the check it answered, so a later Check the code starts clear.
  const [failed, setFailed] = useState<{ readonly check: CheckEvent; readonly error: string }>();
  const view = pairing.view;

  // The dialog goes either way; a failed end is said by the opener, which stays on screen.
  const close = () => {
    pairing.close().then(props.onClose, () => {
      props.onClose();
      props.onCloseFailed();
    });
  };

  const answer = (allow: boolean, check: CheckEvent) => {
    const { phoneName } = check;
    setBusy(true);
    setFailed(undefined);
    (allow ? pairing.allow() : pairing.deny())
      .catch(() =>
        setFailed({
          check,
          error: allow ? words.allowFailed(phoneName) : words.denyFailed(phoneName),
        }),
      )
      .finally(() => setBusy(false));
  };

  if (view.stage === "check") {
    const error = failed?.check === view.check ? failed.error : undefined;
    return (
      <Dialog
        size="md"
        title={words.CHECK_TITLE}
        closeLabel={`Close ${words.TITLE}`}
        confirm={{ label: words.ALLOW, busyLabel: words.ALLOWING }}
        cancelLabel={words.DONT_ALLOW}
        busy={busy}
        {...(error === undefined ? {} : { error })}
        onConfirm={() => answer(true, view.check)}
        // Don't allow refuses the phone; Escape and the ✕ only close, which ends the pairing too.
        onCancel={(reason) => (reason === "button" ? answer(false, view.check) : close())}
      >
        <CheckStep check={view.check} provider={props.provider} />
      </Dialog>
    );
  }

  return (
    <Dialog size="md" title={words.TITLE} closeLabel={`Close ${words.TITLE}`} onCancel={close}>
      <Step {...props} view={view} newCode={() => void pairing.newCode()} onDone={close} />
    </Dialog>
  );
}

/** Every step but Check the code, which has its own footer. */
function Step({
  view,
  provider,
  allowRisky,
  openExternal,
  now = Date.now,
  newCode,
  onDone,
}: PairDialogProps & {
  readonly view: Exclude<PairingView, { readonly stage: "check" }>;
  readonly newCode: () => void;
  readonly onDone: () => void;
}) {
  switch (view.stage) {
    case "starting":
      return <p role="status">{words.STARTING}</p>;
    case "code":
      return (
        <CodeStep
          code={view.code}
          refused={view.refused}
          provider={provider}
          now={now}
          onNewCode={newCode}
        />
      );
    case "paired":
      return <PairedStep phone={view.phone} allowRisky={allowRisky} onDone={onDone} />;
    case "ended":
      return (
        <EndedStep
          ended={view.ended}
          provider={provider}
          openExternal={openExternal}
          onNewCode={newCode}
        />
      );
    case "failed":
      return <FailedStep onTryAgain={newCode} />;
  }
}
