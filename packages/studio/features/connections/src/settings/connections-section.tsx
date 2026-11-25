import { Button, Callout, EmptyState, useOpenExternal } from "@halonicjs/studio-kit";
import {
  type AgentConnection,
  type AgentConnections,
  AgentConnectionsService,
} from "@halonicjs/studio-services";
import { type SettingsSectionProps, sectionHeading } from "@halonicjs/studio-shell";
import { useEffect, useRef, useState } from "react";
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

/**
 * Where focus goes once a dialog closed and the list shows what it did, since the button that
 * opened it may be gone (component specs 23 A2): a row's Disconnect while that row is listed,
 * else `fallback`.
 */
interface FocusNext {
  /** Whether the list shows the change yet: the new row is in it, or the removed one has left. */
  readonly shown: (list: readonly AgentConnection[]) => boolean;
  readonly row: AgentConnection["id"] | undefined;
  readonly fallback: "heading" | "connect";
}

/** The Connect Paperclip button, in the empty state or under the rows: the empty state's has no ref. */
function connectButton(root: HTMLElement | null): HTMLElement | null {
  const buttons = [...(root?.querySelectorAll("button") ?? [])];
  return buttons.find((found) => found.textContent?.trim() === words.CONNECT) ?? null;
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
  const root = useRef<HTMLDivElement>(null);
  const disconnectButtons = useRef(new Map<AgentConnection["id"], HTMLButtonElement>());
  const focusNext = useRef<FocusNext | undefined>(undefined);

  // Runs after the commit that closed the dialog, so it overrides the kit's move back to the
  // opener, and again whenever the list is read, until the list shows the change.
  const dialogOpen = connecting !== undefined || disconnecting !== undefined;
  useEffect(() => {
    const next = focusNext.current;
    if (dialogOpen || next === undefined || !Array.isArray(list) || !next.shown(list)) return;
    focusNext.current = undefined;
    const row = next.row === undefined ? undefined : disconnectButtons.current.get(next.row);
    const fallback =
      next.fallback === "connect" ? connectButton(root.current) : sectionHeading(root.current);
    (row ?? fallback)?.focus();
  }, [dialogOpen, list]);

  const tell = (next: DisconnectNote) => {
    setNote(next);
    announce(next.kind === "line" ? next.line : `${next.ending.heading} ${next.ending.text}`);
  };

  const connected = (connection: AgentConnection) => {
    focusNext.current = {
      shown: (now) => now.some((known) => known.id === connection.id),
      row: connection.id,
      fallback: "heading",
    };
    setConnecting(undefined);
    announce(words.connectedLine(connection.label));
  };

  // A cancel or a failed Disconnect keeps the row, so focus goes back to its Disconnect.
  const disconnectDone = (
    connection: AgentConnection,
    result: DisconnectNote | undefined,
    gone: boolean,
  ) => {
    if (gone && Array.isArray(list)) {
      const at = list.findIndex((known) => known.id === connection.id);
      focusNext.current = {
        shown: (now) => now.every((known) => known.id !== connection.id),
        row: list[at + 1]?.id,
        fallback: "connect",
      };
    }
    setDisconnecting(undefined);
    if (result !== undefined) tell(result);
  };

  if (list === undefined) return null;
  if (list === "failed") return <p className="m-0 text-danger">{words.LIST_FAILED}</p>;
  return (
    <div ref={root} className="flex flex-col gap-4">
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
                disconnectRef={(node) => {
                  if (node) disconnectButtons.current.set(connection.id, node);
                  else disconnectButtons.current.delete(connection.id);
                }}
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
          onDone={(result, gone) => disconnectDone(disconnecting, result, gone)}
        />
      )}
      {connecting === undefined ? null : (
        <ConnectDialog
          connections={connections}
          again={connecting.again}
          onClose={() => setConnecting(undefined)}
          onConnected={connected}
          onCancelFailed={() =>
            tell({ kind: "line", line: words.CANCEL_FAILED, tone: "attention" })
          }
          {...(now === undefined ? {} : { now })}
        />
      )}
    </div>
  );
}
