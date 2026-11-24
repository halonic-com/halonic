import { Button, Callout } from "@halonicjs/studio-kit";
import {
  type AgentConnection,
  type AgentConnections,
  AgentConnectionsService,
} from "@halonicjs/studio-services";
import type { SettingsSectionProps } from "@halonicjs/studio-shell";
import { useEffect, useState } from "react";
import { ConnectDialog } from "../connect/connect-dialog.tsx";
import * as words from "../connections-words.ts";
import { ConnectionRow } from "./connection-row.tsx";

/** Settings › Connections as the settings container shows it, over the engine's connections. */
export function ConnectionsSection({ context }: SettingsSectionProps) {
  const connections = context.services.find(AgentConnectionsService);
  if (connections === undefined) return null;
  return (
    <ConnectionsView
      connections={connections}
      announce={(line) => context.announcer.announce(line)}
    />
  );
}

/** The connections as they are now, read again whenever the engine says they changed. */
function useConnectionList(
  connections: AgentConnections,
): readonly AgentConnection[] | "failed" | undefined {
  const [list, setList] = useState<readonly AgentConnection[] | "failed">();
  useEffect(() => {
    let current = true;
    const read = () => {
      connections.list().then(
        (next) => {
          if (current) setList(next);
        },
        () => {
          if (current) setList("failed");
        },
      );
    };
    const stop = connections.subscribe(read);
    read();
    return () => {
      current = false;
      stop();
    };
  }, [connections]);
  return list;
}

/** What the dialog is open for: a new connection, or signing in again to a signed-out one. */
type Connecting = { readonly again?: AgentConnection } | undefined;

/** The props of {@link ConnectionsView}. */
export interface ConnectionsViewProps {
  readonly connections: AgentConnections;
  /** Says a result in the dialog: the settings container's live region. */
  readonly announce: (line: string) => void;
  /** Where the Connect dialog's countdown counts from. Default the clock. */
  readonly now?: () => number;
}

/** The section's view: what happened last, a row per connection, and Connect Paperclip. */
export function ConnectionsView({ connections, announce, now }: ConnectionsViewProps) {
  const list = useConnectionList(connections);
  const [connecting, setConnecting] = useState<Connecting>();
  // What the last Disconnect or a failed cancel said, until the next one.
  const [note, setNote] = useState<{
    readonly line: string;
    readonly tone: "info" | "attention";
  }>();

  const tell = (line: string, tone: "info" | "attention") => {
    setNote({ line, tone });
    announce(line);
  };

  const disconnect = (connection: AgentConnection): Promise<void> =>
    connections.disconnect(connection.id).then(
      (result) =>
        tell(
          words.disconnectedLine(connection.label, result),
          result.revoked ? "info" : "attention",
        ),
      () => tell(words.disconnectFailed(connection.label), "attention"),
    );

  if (list === undefined) return null;
  if (list === "failed") return <p className="m-0 text-danger">{words.LIST_FAILED}</p>;
  return (
    <div className="flex flex-col gap-6">
      {note === undefined ? null : <Callout tone={note.tone}>{note.line}</Callout>}
      {list.length === 0 ? (
        <p className="m-0 text-fg-muted">{words.NONE_YET}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border p-0">
          {list.map((connection) => (
            <ConnectionRow
              key={connection.id}
              connection={connection}
              onSignInAgain={() => setConnecting({ again: connection })}
              onDisconnect={() => disconnect(connection)}
            />
          ))}
        </ul>
      )}
      <div>
        <Button variant="secondary" onClick={() => setConnecting({})}>
          {words.CONNECT}
        </Button>
      </div>
      {connecting === undefined ? null : (
        <ConnectDialog
          connections={connections}
          again={connecting.again}
          onClose={() => setConnecting(undefined)}
          onCancelFailed={() => tell(words.CANCEL_FAILED, "attention")}
          {...(now === undefined ? {} : { now })}
        />
      )}
    </div>
  );
}
