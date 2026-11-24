import { Button, StatusChip, type StatusChipTone } from "@halonicjs/studio-kit";
import type { AgentConnection } from "@halonicjs/studio-services";
import { useRef, useState } from "react";
import * as words from "../connections-words.ts";

const chipTones: Record<AgentConnection["state"]["kind"], StatusChipTone> = {
  online: "success",
  offline: "attention",
  "signed-out": "attention",
};

/**
 * One connection, shown like a read-only hub (`connections.connection-row`): its label and
 * address, its state, what its key can do, Sign in again once it is signed out, and Disconnect.
 */
export function ConnectionRow({
  connection,
  onSignInAgain,
  onDisconnect,
}: {
  readonly connection: AgentConnection;
  readonly onSignInAgain: () => void;
  /** Disconnects it; the row ignores a second press until this has settled. */
  readonly onDisconnect: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  // A ref, not state: two clicks can land before React renders again.
  const running = useRef(false);
  const disconnect = () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    void onDisconnect().finally(() => {
      running.current = false;
      setBusy(false);
    });
  };
  return (
    <li className="flex flex-col gap-3 px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="m-0 text-fg">{connection.label}</p>
          <p className="m-0 break-all font-mono text-small text-fg-muted">{connection.address}</p>
        </div>
        <StatusChip tone={chipTones[connection.state.kind]} dot>
          {words.stateWords(connection.state)}
        </StatusChip>
      </div>
      <p className="m-0 text-small text-fg-muted">{words.KEY_POWER}</p>
      <div className="flex flex-wrap gap-2">
        {connection.state.kind === "signed-out" ? (
          <Button variant="primary" onClick={onSignInAgain}>
            {words.SIGN_IN_AGAIN}
          </Button>
        ) : null}
        <Button
          variant="danger-outline"
          busy={busy}
          busyLabel={words.DISCONNECTING}
          onClick={disconnect}
        >
          {words.DISCONNECT}
        </Button>
      </div>
    </li>
  );
}
