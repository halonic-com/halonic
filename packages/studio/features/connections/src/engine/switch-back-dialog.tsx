import { Dialog } from "@halonicjs/studio-kit";
import type { ServerEngine, ServerEngineLeft } from "@halonicjs/studio-services";
import { useRef, useState } from "react";
import { withCode } from "../connect/connect-steps.tsx";
import type * as connectWords from "../connections-words.ts";
import * as words from "../server-engine-words.ts";

/** What the row says above itself after a switch back or a failed cancel, until the next one. */
export type EngineNote =
  | { readonly kind: "line"; readonly line: string; readonly tone: "info" | "attention" }
  | { readonly kind: "ending"; readonly ending: connectWords.Ending };

/** The note for what switching back did; the setting is This computer whatever it says. */
function noteOf(left: ServerEngineLeft, host: string, name: string): EngineNote {
  if (left.keychainEntryKept === true) {
    return { kind: "ending", ending: words.SWITCHED_KEYCHAIN_KEPT };
  }
  if (left.stillValid) return { kind: "ending", ending: words.switchedStillValid(host, name) };
  return { kind: "line", line: words.switchedBack(host), tone: "info" };
}

/**
 * Asks before it switches the workspace back to This computer, which ends the pairing with `host`
 * (`connections.engine-row`), then asks the host once, however often the button is pressed.
 * `onDone` gets the note to show and whether the switch happened, or nothing when cancelled.
 */
export function SwitchBackDialog({
  engine,
  host,
  name,
  onDone,
}: {
  readonly engine: ServerEngine;
  readonly host: string;
  /** This computer's name, as the server lists it. */
  readonly name: string;
  readonly onDone: (note: EngineNote | undefined, switched: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  // A ref, not state: two clicks can land before React renders again.
  const running = useRef(false);

  const switchBack = () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    engine.useThisComputer().then(
      (left) => onDone(noteOf(left, host, name), true),
      (error: unknown) => {
        console.error("Settings › Connections couldn't switch to this computer", error);
        onDone({ kind: "line", line: words.SWITCH_FAILED, tone: "attention" }, false);
      },
    );
  };

  return (
    <Dialog
      size="sm"
      title={words.SWITCH_BACK_TITLE}
      confirm={{ label: words.USE_THIS_COMPUTER, busyLabel: words.SWITCHING }}
      busy={busy}
      onConfirm={switchBack}
      onCancel={() => onDone(undefined, false)}
    >
      <p className="m-0 text-fg">{withCode(words.switchBackText(host))}</p>
    </Dialog>
  );
}
