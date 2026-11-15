import { Button, Dialog, useOpenExternal, useToastStore } from "@halonicjs/studio-kit";
import { useId, useRef, useState } from "react";
import type { DisconnectAnswer } from "../api.ts";
import { googleAccessUrl, listNames } from "./account-labels.ts";
import { failureLine } from "./failure-line.ts";
import { useNotAnswering } from "./not-answering.tsx";

/** Props for {@link Disconnect}. */
export interface DisconnectProps {
  /** The account's address, named in the question and the toast. */
  readonly email: string;
  /** The ticked services' names, which stop working. */
  readonly serviceNames: readonly string[];
  /** The other accounts that use the same client, so its secret stays. Usually none. */
  readonly clientSharedWith: readonly string[];
  readonly answering: boolean;
  /** Disconnects the account. It rejects when that can't be done. */
  readonly onDisconnect: () => Promise<DisconnectAnswer>;
}

/** The question the dialog asks, and what it says about the client secret (design 4.4). */
function question(props: DisconnectProps): { title: string; body: string } {
  const title = `Disconnect ${props.email}?`;
  if (props.clientSharedWith.length > 0) {
    const others = props.clientSharedWith;
    return {
      title,
      body: `Halonic asks Google to end this sign-in, deletes it and stops using it. The client secret stays, because ${listNames(others)} ${others.length === 1 ? "uses" : "use"} it.`,
    };
  }
  const names = props.serviceNames;
  const stop =
    names.length === 0
      ? ""
      : ` ${listNames(names)} ${names.length === 1 ? "stops" : "stop"} working.`;
  return {
    title,
    body: `Halonic asks Google to end this sign-in, deletes the saved client secret and sign-in, and stops using them.${stop} Your Google Cloud project stays as it is.`,
  };
}

/**
 * **Disconnect Google…** at the bottom of the connector page's Google block, and the question it
 * asks. The dialog starts on **Cancel** (U8). Afterwards a toast says it is done; when Google
 * couldn't be reached to end the sign-in, the toast says so and links to the Google account's
 * permissions, since the sign-in is deleted here either way.
 */
export function Disconnect(props: DisconnectProps) {
  const { email, answering, onDisconnect } = props;
  const notAnswering = useNotAnswering();
  const toasts = useToastStore();
  const openExternal = useOpenExternal();
  const reason = useId();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const link = useRef<HTMLButtonElement>(null);
  const { title, body } = question(props);

  async function confirm() {
    setBusy(true);
    setFailed(undefined);
    try {
      const answer = await onDisconnect();
      setAsking(false);
      toasts?.show(
        answer.kind === "ended"
          ? { tone: "success", title: `Disconnected ${email}` }
          : {
              tone: "warning",
              title: `Disconnected ${email}`,
              text: "Google couldn't be reached to end the sign-in. You can remove access in your Google account.",
              action: {
                label: "Open Google account",
                onClick: () => void openExternal(googleAccessUrl),
              },
            },
      );
    } catch (error) {
      setFailed(failureLine("disconnect", error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        ref={link}
        variant="ghost"
        unavailable={answering ? undefined : { reason }}
        onClick={() => setAsking(true)}
      >
        Disconnect Google…
      </Button>
      {answering ? null : (
        <span id={reason} className="text-small text-fg-muted">
          {notAnswering}
        </span>
      )}
      {asking ? (
        <Dialog
          title={title}
          confirm={{ label: "Disconnect", variant: "danger", busyLabel: "Disconnecting…" }}
          busy={busy}
          error={failed ?? ""}
          onConfirm={() => void confirm()}
          onCancel={() => setAsking(false)}
          returnFocus={() => link.current}
        >
          <p>{body}</p>
        </Dialog>
      ) : null}
    </>
  );
}
