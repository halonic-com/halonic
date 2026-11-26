import { Callout, Field, RadioGroup, type RadioOption, StatusChip } from "@halonicjs/studio-kit";
import type { ServerEngine, ServerEngineView } from "@halonicjs/studio-services";
import { useCallback, useEffect, useState } from "react";
import { plainText, withCode } from "../connect/connect-steps.tsx";
import * as connectWords from "../connections-words.ts";
import * as words from "../server-engine-words.ts";
import { PairDialog } from "./pair-dialog.tsx";
import { type EngineNote, SwitchBackDialog } from "./switch-back-dialog.tsx";

type Engine = "this-computer" | "server";

/** The paired server as this window last heard it: when it checked, and the pairing's end. */
interface Paired {
  readonly checkedAt: string;
  readonly sessionEndsAt: string;
}

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
  const [paired, setPaired] = useState<Paired>();
  const [pairing, setPairing] = useState<{ readonly again?: { readonly address: string } }>();
  const [switching, setSwitching] = useState(false);
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
    (done: { readonly address: string; readonly sessionEndsAt: string }) => {
      setPairing(undefined);
      setNote(undefined);
      setPaired({ checkedAt: new Date(now?.() ?? Date.now()).toISOString(), ...done });
      announce(words.pairedLine(hostOf(done.address)));
      read();
    },
    [announce, now, read],
  );

  if (state === undefined) return null;
  const engineNow: Engine = state.engine === "server" ? "server" : "this-computer";
  const host = state.engine === "server" ? hostOf(state.address) : "";

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
                pairing={state.pairing}
                paired={paired}
                onPairAgain={() => setPairing({ again: { address: state.address } })}
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
          computerName={words.NAME_FALLBACK}
          onClose={() => setPairing(undefined)}
          onPaired={onPaired}
          onCancelFailed={() =>
            tell({ kind: "line", line: words.PAIR_CANCEL_FAILED, tone: "attention" })
          }
          {...(now === undefined ? {} : { now })}
        />
      )}
      {switching ? (
        <SwitchBackDialog
          engine={engine}
          host={host}
          name={words.NAME_FALLBACK}
          onDone={(done, switched) => {
            setSwitching(false);
            if (done !== undefined) tell(done);
            if (switched) {
              setPaired(undefined);
              read();
            }
          }}
        />
      ) : null}
    </div>
  );
}

/** Under Server: the host, its chip and meta line, and a callout when it can't be used. */
function ServerLine({
  host,
  pairing,
  paired,
  onPairAgain,
}: {
  readonly host: string;
  readonly pairing: "kept" | "missing" | "unreadable";
  readonly paired: Paired | undefined;
  readonly onPairAgain: () => void;
}) {
  const kept = pairing === "kept";
  const meta = kept
    ? paired && words.connectedMeta(paired.checkedAt, paired.sessionEndsAt)
    : pairing === "missing" && words.SIGNED_OUT_META;
  const pairAgain = { label: words.PAIR_AGAIN, onClick: onPairAgain };
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-body-strong text-fg">{host}</span>
        <StatusChip tone={kept ? "success" : "danger"} dot>
          {connectWords.stateChips[kept ? "online" : "signed-out"]}
        </StatusChip>
      </div>
      {meta ? <p className="m-0 text-small text-fg-muted">{meta}</p> : null}
      {kept ? null : (
        <Callout tone="danger" action={pairAgain}>
          {pairing === "missing" ? words.signedOutCallout(host) : words.KEYCHAIN_UNREADABLE}
        </Callout>
      )}
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
