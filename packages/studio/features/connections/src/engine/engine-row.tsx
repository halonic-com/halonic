import {
  Button,
  Callout,
  Field,
  RadioGroup,
  type RadioOption,
  StatusChip,
  type StatusChipTone,
} from "@halonicjs/studio-kit";
import type { ServerEngine, ServerEngineView } from "@halonicjs/studio-services";
import { useCallback, useEffect, useState } from "react";
import { plainText, withCode } from "../connect/connect-steps.tsx";
import * as connectWords from "../connections-words.ts";
import * as words from "../server-engine-words.ts";
import { AccessDialog } from "./access-dialog.tsx";
import { PairDialog } from "./pair-dialog.tsx";
import { type EngineNote, SwitchBackDialog } from "./switch-back-dialog.tsx";

type Engine = "this-computer" | "server";

/** The host's answer while the engine is a server. */
type OnServer = Extract<ServerEngineView, { engine: "server" }>;

/** What the row shows under Server: the server's own answer, or why the pairing can't be used. */
type Shown = "online" | "offline" | "signed-out" | "unreadable" | "access-refused";

const chipTones: Record<Shown, StatusChipTone> = {
  online: "success",
  offline: "attention",
  "signed-out": "danger",
  unreadable: "danger",
  "access-refused": "danger",
};

/** The address's host, as the row shows it: `halonic.example.com`. */
function hostOf(address: string): string {
  try {
    return new URL(address).host;
  } catch {
    return address;
  }
}

/** The props of {@link EngineRow}. */
export interface EngineRowProps {
  readonly engine: ServerEngine;
  /** Says a result: the settings container's live region. */
  readonly announce: (line: string) => void;
  /** Where the dialog's countdown counts from. Default the clock. */
  readonly now?: () => number;
}

/**
 * Messaging engine: This computer | Server, at the top of Settings › Connections
 * (`connections.engine-row`). Picking Server opens Pair with a server, and the row moves to Server
 * only once the host paired; picking This computer while on Server asks first, because it ends
 * the pairing. Under Server it shows the server's host and whether the pairing can be used.
 */
export function EngineRow({ engine, announce, now }: EngineRowProps) {
  const [state, setState] = useState<ServerEngineView>();
  const [pairing, setPairing] = useState<{ readonly again?: { readonly address: string } }>();
  const [switching, setSwitching] = useState(false);
  const [updatingAccess, setUpdatingAccess] = useState(false);
  const [note, setNote] = useState<EngineNote>();

  const read = useCallback(() => {
    engine.state().then(setState, (error: unknown) => {
      // No row rather than a wrong one: the Paperclip connections below still work.
      console.error("Settings › Connections couldn't read the messaging engine", error);
    });
  }, [engine]);
  useEffect(read, [read]);

  const tell = (next: EngineNote) => {
    setNote(next);
    announce(
      next.kind === "line" ? next.line : `${next.ending.heading} ${plainText(next.ending.text)}`,
    );
  };

  const onPaired = useCallback(
    (done: { readonly address: string }) => {
      setPairing(undefined);
      setNote(undefined);
      announce(words.pairedLine(hostOf(done.address)));
      read();
    },
    [announce, read],
  );

  if (state === undefined) return null;
  const engineNow: Engine = state.engine === "server" ? "server" : "this-computer";
  const host = state.engine === "server" ? hostOf(state.address) : "";
  // The name the server lists this computer as, or on This computer its own name for P1.
  const name =
    (state.engine === "keychain-needed" ? undefined : state.computerName) ?? words.NAME_FALLBACK;

  const pick = (picked: Engine) => {
    if (picked === engineNow) return;
    if (picked === "server") setPairing({});
    else setSwitching(true);
  };

  const server: RadioOption<Engine> =
    state.engine === "keychain-needed"
      ? { value: "server", label: words.SERVER, unavailable: true, note: words.KEYCHAIN_NEEDED }
      : {
          value: "server",
          label: words.SERVER,
          field:
            state.engine === "server" ? (
              <ServerLine
                host={host}
                state={state}
                onPairAgain={() => setPairing({ again: { address: state.address } })}
                onUpdateAccess={() => setUpdatingAccess(true)}
              />
            ) : null,
        };

  return (
    <div className="flex flex-col gap-3">
      {note === undefined ? null : <NoteCallout note={note} />}
      <Field label={words.ENGINE_LABEL} hint={words.ENGINE_LINE} hintAbove>
        <RadioGroup
          options={[{ value: "this-computer", label: words.THIS_COMPUTER }, server]}
          value={engineNow}
          onChange={pick}
        />
      </Field>
      {pairing === undefined ? null : (
        <PairDialog
          engine={engine}
          again={pairing.again}
          computerName={name}
          onClose={() => setPairing(undefined)}
          onPaired={onPaired}
          onCancelFailed={() =>
            tell({ kind: "line", line: words.PAIR_CANCEL_FAILED, tone: "attention" })
          }
          {...(now === undefined ? {} : { now })}
        />
      )}
      {updatingAccess ? (
        <AccessDialog
          engine={engine}
          onDone={(done, saved) => {
            setUpdatingAccess(false);
            if (done !== undefined) tell({ kind: "line", ...done });
            if (saved) read();
          }}
        />
      ) : null}
      {switching ? (
        <SwitchBackDialog
          engine={engine}
          host={host}
          name={name}
          onDone={(done, switched) => {
            setSwitching(false);
            if (done !== undefined) tell(done);
            if (switched) read();
          }}
        />
      ) : null}
    </div>
  );
}

/** What the row shows: the server's answer while the keychain holds the pairing; a 401 is signed out. */
function shownOf(state: OnServer): Shown {
  if (state.pairing === "missing") return "signed-out";
  if (state.pairing === "unreadable") return "unreadable";
  return state.server?.state ?? "online";
}

/** The meta line after the host: "Checked 14:02 · pairing ends 23 Feb 2027", or none. */
function metaOf(state: OnServer, shown: Shown): string | undefined {
  const asOf = state.server?.checkedAt;
  switch (shown) {
    case "online":
      if (asOf === undefined) return undefined;
      return state.sessionEndsAt === undefined
        ? connectWords.stateMeta({ kind: "online", asOf }, undefined)
        : words.connectedMeta(asOf, state.sessionEndsAt);
    case "offline":
      return asOf === undefined
        ? undefined
        : connectWords.stateMeta({ kind: "offline", asOf }, undefined);
    case "signed-out":
      return words.SIGNED_OUT_META;
    default:
      return undefined;
  }
}

/** Under Server: the host, its chip and meta line, and a callout when it can't be used. */
function ServerLine({
  host,
  state,
  onPairAgain,
  onUpdateAccess,
}: {
  readonly host: string;
  readonly state: OnServer;
  readonly onPairAgain: () => void;
  readonly onUpdateAccess: () => void;
}) {
  const shown = shownOf(state);
  const meta = metaOf(state, shown);
  const pairAgain = { label: words.PAIR_AGAIN, onClick: onPairAgain };
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-body-strong text-fg">{host}</span>
        <StatusChip tone={chipTones[shown]} dot>
          {
            connectWords.stateChips[
              shown === "unreadable" || shown === "access-refused" ? "signed-out" : shown
            ]
          }
        </StatusChip>
      </div>
      {meta === undefined ? null : <p className="m-0 text-small text-fg-muted">{meta}</p>}
      {shown === "offline" ? (
        <Callout tone="attention">{words.SERVER_OFFLINE_CALLOUT}</Callout>
      ) : null}
      {shown === "access-refused" ? (
        <Callout tone="danger" action={{ label: words.UPDATE_ACCESS, onClick: onUpdateAccess }}>
          {words.ACCESS_REFUSED}
        </Callout>
      ) : null}
      {shown !== "access-refused" && state.pairing === "kept" ? (
        <div>
          <Button variant="ghost" size="sm" onClick={onUpdateAccess}>
            {words.UPDATE_ACCESS}
          </Button>
        </div>
      ) : null}
      {shown === "signed-out" || shown === "unreadable" ? (
        <Callout tone="danger" action={pairAgain}>
          {shown === "signed-out" ? words.signedOutCallout(host) : words.KEYCHAIN_UNREADABLE}
        </Callout>
      ) : null}
    </div>
  );
}

/** What the last switch back or a failed cancel said. */
function NoteCallout({ note }: { readonly note: EngineNote }) {
  if (note.kind === "line") return <Callout tone={note.tone}>{note.line}</Callout>;
  return (
    <Callout tone="attention" title={note.ending.heading}>
      {withCode(note.ending.text)}
    </Callout>
  );
}
