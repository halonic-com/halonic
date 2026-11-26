import { Button, Callout, EmptyState, useOpenExternal } from "@halonicjs/studio-kit";
import {
  type AgentConnection,
  type AgentConnections,
  AgentConnectionsService,
  ServerEngineService,
} from "@halonicjs/studio-services";
import { type SettingsSectionProps, sectionHeading } from "@halonicjs/studio-shell";
import { useEffect, useRef, useState } from "react";
import { ConnectDialog } from "../connect/connect-dialog.tsx";
import * as words from "../connections-words.ts";
import { EngineRow } from "../engine/engine-row.tsx";
import { ConnectionRow } from "./connection-row.tsx";
import { DisconnectDialog, type DisconnectNote } from "./disconnect-dialog.tsx";

/**
 * Settings › Connections as the settings container shows it: the Messaging engine row where the
 * host serves the server engine, then the engine's connections.
 */
export function ConnectionsSection({ context }: SettingsSectionProps) {
  const connections = context.services.find(AgentConnectionsService);
  const serverEngine = context.services.find(ServerEngineService);
  if (connections === undefined) return null;
  const announce = (line: string) => context.announcer.announce(line);
  return (
    <div className="flex flex-col gap-6">
      {serverEngine === undefined ? null : <EngineRow engine={serverEngine} announce={announce} />}
      <ConnectionsView connections={connections} announce={announce} />
    </div>
  );
}

/** The connections as they are now, and a way to read them again after a failed read. */
interface ConnectionList {
  readonly list: readonly AgentConnection[] | "failed" | undefined;
  /** How many reads failed, so the failure line is said again after each one. */
  readonly failures: number;
  readonly retry: () => void;
}

/**
 * The connections as they are now, read again whenever the engine says they
 * changed, and when the person asks after a failed read
 * (`connections.list-retry`). A failed read goes to the console with its
 * error, so it is reported, not only shown.
 */
function useConnectionList(connections: AgentConnections): ConnectionList {
  const [list, setList] = useState<readonly AgentConnection[] | "failed">();
  const [failures, setFailures] = useState(0);
  // Try again counts up `attempt`, which runs the effect again.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    const read = () => {
      connections.list().then(
        (next) => {
          if (current) setList(next);
        },
        (error: unknown) => {
          console.error("Settings › Connections couldn't read the connections", error);
          if (!current) return;
          setList("failed");
          setFailures((count) => count + 1);
        },
      );
    };
    const stop = connections.subscribe(read);
    read();
    return () => {
      current = false;
      stop();
    };
  }, [connections, attempt]);
  return { list, failures, retry: () => setAttempt((count) => count + 1) };
}

/**
 * What the dialog is open for: a new connection, signing in again to a signed-out one, or another
 * account on a connected one's Paperclip.
 */
type Connecting =
  | { readonly again?: AgentConnection; readonly another?: AgentConnection }
  | undefined;

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
 * opened it may be gone (component specs 23 A2), or once Try again read the list and took the
 * failure line and its button away: a row's Disconnect while that row is listed, else `fallback`.
 */
interface FocusNext {
  /** Whether the list shows the change yet: the new row is in it, or the removed one has left. */
  readonly shown: (list: readonly AgentConnection[]) => boolean;
  /** The row whose Disconnect takes focus, picked from the list as it is shown. */
  readonly row: (list: readonly AgentConnection[]) => AgentConnection["id"] | undefined;
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
  const { list, failures, retry } = useConnectionList(connections);
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
    const id = next.row(list);
    const row = id === undefined ? undefined : disconnectButtons.current.get(id);
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
      row: () => connection.id,
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
        row: () => list[at + 1]?.id,
        fallback: "connect",
      };
    }
    setDisconnecting(undefined);
    if (result !== undefined) tell(result);
  };

  // Try again goes away once the list reads, so focus goes to the first row, or Connect Paperclip.
  const tryAgain = () => {
    focusNext.current = { shown: () => true, row: (now) => now[0]?.id, fallback: "connect" };
    retry();
  };

  if (list === undefined) return null;
  if (list === "failed") {
    return (
      <div className="flex flex-col items-start gap-3">
        {/* A new key for each failed read, so a second failure is said again. */}
        <p key={failures} role="alert" className="m-0 text-danger">
          {words.LIST_FAILED}
        </p>
        <Button variant="secondary" onClick={tryAgain}>
          {words.TRY_AGAIN}
        </Button>
      </div>
    );
  }
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
                onAddAccount={() => setConnecting({ another: connection })}
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
          another={connecting.another}
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
