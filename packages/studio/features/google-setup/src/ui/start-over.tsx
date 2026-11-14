import { Button, Dialog } from "@halonicjs/studio-kit";
import { useEffect, useId, useRef, useState } from "react";
import { listNames } from "./account-labels.ts";
import { failureLine } from "./failure-line.ts";

/** Props for {@link StartOver}. */
export interface StartOverProps {
  /** The account's address, named in the question when its client is shared. */
  readonly email: string;
  /** The other accounts that use the same client, so its secret stays. Usually none. */
  readonly clientSharedWith: readonly string[];
  readonly answering: boolean;
  /** Starts the setup over. It rejects when that can't be done. */
  readonly onStartOver: () => Promise<void>;
  /** Called once it is done and the dialog has closed, so the view can move focus to step 1. */
  readonly onStartedOver: () => void;
}

/** The question the dialog asks, and what it says about the client secret. */
function question(props: StartOverProps): { title: string; body: string } {
  const title = "Start the Google setup over?";
  if (props.clientSharedWith.length === 0) {
    return {
      title,
      body: "Halonic deletes the saved client ID and secret and stops using them. Your Google Cloud project stays as it is.",
    };
  }
  const others = props.clientSharedWith;
  return {
    title: `Start the Google setup over for ${props.email}?`,
    body: `Halonic deletes this account's setup and stops using it. The client secret stays, because ${listNames(others)} ${others.length === 1 ? "uses" : "use"} it. Your Google Cloud project stays as it is.`,
  };
}

/**
 * **Start over**, a plain link at the bottom of the item, and the question it asks. The dialog
 * starts on **Cancel**; **Cancel** returns focus to the link. It never touches Google.
 */
export function StartOver(props: StartOverProps) {
  const { answering, onStartOver, onStartedOver } = props;
  const reason = useId();
  const [asking, setAsking] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const link = useRef<HTMLButtonElement>(null);
  const { title, body } = question(props);

  // The dialog gives focus back to the link as it closes, so the view moves it on afterwards.
  useEffect(() => {
    if (!done || asking) return;
    setDone(false);
    onStartedOver();
  }, [done, asking, onStartedOver]);

  async function confirm() {
    setBusy(true);
    setFailed(undefined);
    try {
      await onStartOver();
      setAsking(false);
      setDone(true);
    } catch (error) {
      setFailed(failureLine("start over", error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        ref={link}
        variant="ghost"
        size="sm"
        unavailable={answering ? undefined : { reason }}
        onClick={() => setAsking(true)}
      >
        Start over
      </Button>
      {answering ? null : (
        <span id={reason} className="text-small text-fg-muted">
          The engine isn't answering.
        </span>
      )}
      {asking ? (
        <Dialog
          title={title}
          confirm={{ label: "Start over", variant: "danger", busyLabel: "Starting over…" }}
          busy={busy}
          error={failed ?? ""}
          onConfirm={() => void confirm()}
          onCancel={() => setAsking(false)}
          returnFocus={() => link.current}
        >
          <div className="flex flex-col gap-3">
            <p>{body}</p>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
