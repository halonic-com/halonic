import { Dialog } from "@halonicjs/studio-kit";
import type { ServerEngine } from "@halonicjs/studio-services";
import { useRef, useState } from "react";
import { withCode } from "../connect/connect-steps.tsx";
import * as words from "../server-engine-words.ts";
import { AccessFields } from "./access-fields.tsx";

/** What the row says after the dialog: a line to announce, and whether the access check refused. */
export type AccessNote = { readonly line: string; readonly tone: "info" | "attention" };

/**
 * Update access (`connections.server-access-dialog`): sets the Access client ID and secret the host
 * keeps with the pairing, so a token rotated at Cloudflare needs no new pairing, or clears them
 * when both are empty. The fields start empty: the host never gives the values back.
 */
export function AccessDialog({
  engine,
  onDone,
}: {
  readonly engine: ServerEngine;
  /** Runs when the dialog is done: the note to show, or nothing when cancelled. */
  readonly onDone: (note: AccessNote | undefined, saved: boolean) => void;
}) {
  const [value, setValue] = useState({ clientId: "", clientSecret: "" });
  const [busy, setBusy] = useState(false);
  const [bothNeeded, setBothNeeded] = useState(false);
  const [failed, setFailed] = useState<string>();
  const running = useRef(false);

  const save = () => {
    const clientId = value.clientId.trim();
    const clientSecret = value.clientSecret.trim();
    const partial = (clientId === "") !== (clientSecret === "");
    setBothNeeded(partial);
    if (partial || running.current) return;
    running.current = true;
    setBusy(true);
    setFailed(undefined);
    engine.setAccess(clientId === "" ? undefined : { clientId, clientSecret }).then(
      (answer) => {
        running.current = false;
        setBusy(false);
        if (answer.state !== "saved") {
          setFailed(words.ACCESS_NOT_SAVED);
        } else if (answer.server === "access-refused") {
          onDone({ line: words.ACCESS_REFUSED, tone: "attention" }, true);
        } else {
          onDone(
            { line: clientId === "" ? words.ACCESS_CLEARED : words.ACCESS_SAVED, tone: "info" },
            true,
          );
        }
      },
      (error: unknown) => {
        console.error(
          "Settings › Connections couldn't save the Access client ID and secret",
          error,
        );
        running.current = false;
        setBusy(false);
        setFailed(words.ACCESS_NOT_SAVED);
      },
    );
  };

  return (
    <Dialog
      size="md"
      title={words.UPDATE_ACCESS_TITLE}
      closeLabel={`Close ${words.UPDATE_ACCESS_TITLE}`}
      form
      confirm={{ label: words.SAVE, busyLabel: words.SAVING }}
      busy={busy}
      onConfirm={save}
      onCancel={() => onDone(undefined, false)}
      {...(failed === undefined ? {} : { error: failed })}
    >
      <div className="flex flex-col gap-4">
        <p className="m-0 text-body text-fg">{withCode(words.UPDATE_ACCESS_LEAD)}</p>
        <AccessFields
          value={value}
          onChange={setValue}
          readOnly={busy}
          error={bothNeeded ? words.ACCESS_BOTH : null}
        />
      </div>
    </Dialog>
  );
}
