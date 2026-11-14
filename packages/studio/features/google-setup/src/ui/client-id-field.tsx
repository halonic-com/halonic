import { isClientId, looksLikeGoogleClientSecret } from "@halonicjs/google-setup";
import { Button, CopyButton, Field, Input } from "@halonicjs/studio-kit";
import { useEffect, useId, useState } from "react";
import { failureLine } from "./failure-line.ts";

/** What is wrong with a client ID that has the wrong shape. */
export const clientIdShapeError =
  "A client ID ends in .apps.googleusercontent.com. Copy it from the client's page.";

/** What the field says when a client secret was pasted into it. */
export const secretInClientId = "That's the client secret. It goes in the field below.";

/** How long typing must stop before the shape is checked, so no error flashes mid-word. */
const typingPause = 700;

/** Props for {@link ClientIdField}. */
export interface ClientIdFieldProps {
  /** The client ID as saved, or `null`. It is public, so it is shown in full. */
  readonly saved: string | null;
  readonly answering: boolean;
  /** Saves a client ID that has the right shape. It rejects when it can't be saved. */
  readonly onSave: (clientId: string) => Promise<void>;
  /** A client secret was pasted here and cleared: the secret field should take focus. */
  readonly onSecretPasted: () => void;
}

/**
 * The client ID of step 6. The shape is checked once typing pauses, and a `GOCSPX-` value, which
 * is a client secret in the wrong place, is cleared at once without being kept anywhere.
 */
export function ClientIdField(props: ClientIdFieldProps) {
  const { saved, answering, onSave, onSecretPasted } = props;
  const reason = useId();
  const [text, setText] = useState("");
  // Whether the pause or leaving the field has made the shape check visible.
  const [checked, setChecked] = useState(false);
  // What a screen reader is told: the wrong shape once the field is left, the pasted secret at once.
  const [announcement, setAnnouncement] = useState("");
  const [pasted, setPasted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);

  const clientId = text.trim();
  const valid = isClientId(clientId);
  const wrongShape = clientId !== "" && !valid;

  useEffect(() => {
    if (text.trim() === "") return;
    const timer = setTimeout(() => setChecked(true), typingPause);
    return () => clearTimeout(timer);
  }, [text]);

  function typed(value: string) {
    setFailed(null);
    setAnnouncement("");
    setChecked(false);
    if (looksLikeGoogleClientSecret(value)) {
      setText("");
      setPasted(true);
      setAnnouncement(secretInClientId);
      onSecretPasted();
      return;
    }
    setPasted(false);
    setText(value);
  }

  async function save() {
    if (!answering || !valid || busy) return;
    setBusy(true);
    setFailed(null);
    try {
      await onSave(clientId);
      setText("");
      setChanging(false);
    } catch (error) {
      setFailed(failureLine("save the client ID", error));
    } finally {
      setBusy(false);
    }
  }

  if (saved !== null && !changing) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-caption text-fg-muted">Client ID</span>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 break-all text-body text-fg">{saved}</code>
          <CopyButton text={saved} label="Copy the client ID" />
          <Button variant="ghost" size="sm" onClick={() => setChanging(true)}>
            Change client ID
          </Button>
        </div>
      </div>
    );
  }

  const shapeShown = wrongShape && checked;
  let unavailableText = "Paste the client ID to save it.";
  if (!answering) unavailableText = "Can't save while the engine isn't answering.";
  else if (shapeShown) unavailableText = clientIdShapeError;
  const error = pasted ? secretInClientId : failed;
  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <Field label="Client ID" error={error}>
            <Input
              value={text}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => typed(event.target.value)}
              onBlur={() => {
                if (wrongShape) setAnnouncement(clientIdShapeError);
              }}
            />
          </Field>
        </div>
        <Button
          type="submit"
          variant="primary"
          busy={busy}
          busyLabel="Saving…"
          unavailable={answering && valid ? undefined : { reason }}
        >
          Save client ID
        </Button>
        {changing ? (
          <Button variant="ghost" onClick={() => setChanging(false)}>
            Cancel
          </Button>
        ) : null}
      </div>
      {answering && valid ? null : (
        <p id={reason} className="text-small text-fg-muted">
          {unavailableText}
        </p>
      )}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </form>
  );
}
