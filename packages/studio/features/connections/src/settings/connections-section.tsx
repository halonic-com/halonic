import { Button, Callout, EmptyState, useOpenExternal } from "@halonicjs/studio-kit";
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
import { DisconnectDialog, type DisconnectNote } from "./disconnect-dialog.tsx";

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

/** What the last Disconnect or a failed cancel said, until the next one. */
function NoteCallout({ note }: { readonly note: DisconnectNote }) {
  const openExternal = useOpenExternal();
  if (note.kind === "line") return <Callout tone={note.tone}>{note.line}</Callout>;
  return (
    <Callout
      tone="attention"
      title={note.ending.heading}
      action={{ label: words.OPEN_PAPERCLIP, onClick: () => void openExternal(note.address) }}
    >
      {note.ending.text}
    </Callout>
  );
}

/** The section's view: what happened last, a row per connection, and Connect Paperclip. */
export function ConnectionsView({ connections, announce, now }: ConnectionsViewProps) {
  const list = useConnectionList(connections);
  const [connecting, setConnecting] = useState<Connecting>();
  const [disconnecting, setDisconnecting] = useState<AgentConnection>();
  const [note, setNote] = useState<DisconnectNote>();

  const tell = (next: DisconnectNote) => {
    setNote(next);
    announce(next.kind === "line" ? next.line : `${next.ending.heading} ${next.ending.text}`);
  };

  if (list === undefined) return null;
  if (list === "failed") return <p className="m-0 text-danger">{words.LIST_FAILED}</p>;
  return (
    <div className="flex flex-col gap-4">
      {note === undefined ? null : <NoteCallout note={note} />}
      {list.length === 0 ? (
        <EmptyState
          title={words.NONE_TITLE}
          description={words.NONE_LINE}
          action={{ label: words.CONNECT, onClick: () => setConnecting({}) }}
        />
      ) : (
        <>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {list.map((connection) => (
              <ConnectionRow
                key={connection.id}
                connection={connection}
                onSignInAgain={() => setConnecting({ again: connection })}
                onDisconnect={() => setDisconnecting(connection)}
              />
            ))}
          </ul>
          <div>
            <Button variant="secondary" onClick={() => setConnecting({})}>
              {words.CONNECT}
            </Button>
          </div>
        </>
      )}
      {disconnecting === undefined ? null : (
        <DisconnectDialog
          connections={connections}
          connection={disconnecting}
          onDone={(result) => {
            setDisconnecting(undefined);
            if (result !== undefined) tell(result);
          }}
        />
      )}
      {connecting === undefined ? null : (
        <ConnectDialog
          connections={connections}
          again={connecting.again}
          onClose={() => setConnecting(undefined)}
          onCancelFailed={() =>
            tell({ kind: "line", line: words.CANCEL_FAILED, tone: "attention" })
          }
          {...(now === undefined ? {} : { now })}
        />
      )}
    </div>
  );
}
