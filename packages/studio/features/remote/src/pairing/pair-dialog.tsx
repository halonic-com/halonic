import type { RemoteControl } from "@halonicjs/ports";
import { Dialog } from "@halonicjs/studio-kit";
import { useEffect, useState } from "react";
import { type PairingView, usePairing } from "./pairing-flow.ts";
import { CheckStep, CodeStep, PairedStep } from "./pairing-steps.tsx";
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
  /** Where the timer counts from. Default the clock. */
  readonly now?: () => number;
}

/**
 * Pair a phone (`remote.pair-a-phone`): it opens a pairing while it is open, which turns remote
 * on, and closing it ends the pairing, which turns remote off again when no phone is paired
 * (decisions 1 and 10). One dialog walks through the steps, so focus stays inside it: the code to
 * scan or type, Check the code with Allow, and Paired. A pairing that ends without a phone closes
 * the dialog.
 */
export function PairDialog(props: PairDialogProps) {
  const pairing = usePairing(props.remote);
  const [busy, setBusy] = useState(false);
  const view = pairing.view;

  const close = () => {
    void pairing.close().finally(props.onClose);
  };

  useEffect(() => {
    if (view.stage === "ended") props.onClose();
  }, [view.stage, props.onClose]);

  const answer = (allow: boolean) => {
    setBusy(true);
    void (allow ? pairing.allow() : pairing.deny()).finally(() => setBusy(false));
  };

  if (view.stage === "ended") return null;

  if (view.stage === "check") {
    return (
      <Dialog
        size="md"
        title={words.CHECK_TITLE}
        closeLabel={`Close ${words.TITLE}`}
        confirm={{ label: words.ALLOW, busyLabel: words.ALLOWING }}
        cancelLabel={words.DONT_ALLOW}
        busy={busy}
        onConfirm={() => answer(true)}
        // Don't allow refuses the phone; Escape and the ✕ only close, which ends the pairing too.
        onCancel={(reason) => (reason === "button" ? answer(false) : close())}
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
  now = Date.now,
  newCode,
  onDone,
}: PairDialogProps & {
  readonly view: Exclude<PairingView, { readonly stage: "check" | "ended" }>;
  readonly newCode: () => void;
  readonly onDone: () => void;
}) {
  switch (view.stage) {
    case "starting":
      return <p role="status">{words.STARTING}</p>;
    case "code":
      return <CodeStep code={view.code} provider={provider} now={now} onNewCode={newCode} />;
    case "paired":
      return <PairedStep phone={view.phone} allowRisky={allowRisky} onDone={onDone} />;
  }
}
