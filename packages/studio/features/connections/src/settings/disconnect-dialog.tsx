import { Dialog } from "@halonicjs/studio-kit";
import type {
  AgentConnection,
  AgentConnections,
  DisconnectResult,
} from "@halonicjs/studio-services";
import { useRef, useState } from "react";
import * as words from "../connections-words.ts";

/**
 * What the section says after a Disconnect or a failed cancel: one line, or, when the key is still
 * valid, a bold first sentence, the rest and Open Paperclip at the connection's address.
 */
export type DisconnectNote =
  | { readonly kind: "line"; readonly line: string; readonly tone: "info" | "attention" }
  | { readonly kind: "still-valid"; readonly ending: words.Ending; readonly address: string };

/**
 * Whether this computer holds no key for `connection`: the engine has none to revoke, so
 * Disconnect promises no revoke and says no key stays valid (HAL-19120).
 */
function holdsNoKey(connection: AgentConnection): boolean {
  return connection.state.kind === "no-key";
}

/** The note for what Disconnect did. */
function noteOf(connection: AgentConnection, result: DisconnectResult): DisconnectNote {
  if (result.revoked) {
    return { kind: "line", line: words.disconnectedRevoked(connection.label), tone: "info" };
  }
  if (holdsNoKey(connection)) {
    return { kind: "line", line: words.disconnectedNoKey(connection.label), tone: "info" };
  }
  return {
    kind: "still-valid",
    ending: words.disconnectedStillValid(connection.label, result.validUntil),
    address: connection.address,
  };
}

/**
 * Asks before it disconnects `connection`, then asks the engine once, however often the button is
 * pressed. `onDone` gets the note to show, or nothing when the person cancelled, and whether the
 * connection is gone.
 */
export function DisconnectDialog({
  connections,
  connection,
  onDone,
}: {
  readonly connections: AgentConnections;
  readonly connection: AgentConnection;
  readonly onDone: (note: DisconnectNote | undefined, disconnected: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  // A ref, not state: two clicks can land before React renders again.
  const running = useRef(false);

  const disconnect = () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    connections.disconnect(connection.id).then(
      (result) => onDone(noteOf(connection, result), true),
      () =>
        onDone(
          { kind: "line", line: words.disconnectFailed(connection.label), tone: "attention" },
          false,
        ),
    );
  };

  return (
    <Dialog
      size="sm"
      title={words.disconnectTitle(connection.label)}
      confirm={{ label: words.DISCONNECT, variant: "danger", busyLabel: words.DISCONNECTING }}
      busy={busy}
      onConfirm={disconnect}
      onCancel={() => onDone(undefined, false)}
    >
      <p className="m-0 text-fg">
        {holdsNoKey(connection) ? words.DISCONNECT_NO_KEY_TEXT : words.DISCONNECT_TEXT}
      </p>
    </Dialog>
  );
}
