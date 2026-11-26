import {
  Callout,
  Field,
  RadioGroup,
  type RadioOption,
  StatusChip,
  type StatusChipTone,
} from "@halonicjs/studio-kit";
import type { ServerEngine, ServerEngineView } from "@halonicjs/studio-services";
import { useCallback, useEffect, useState } from "react";
import { withCode } from "../connect/connect-steps.tsx";
import * as connectWords from "../connections-words.ts";
import * as words from "../server-engine-words.ts";
import { PairDialog, type PairedAs } from "./pair-dialog.tsx";
import { type EngineNote, SwitchBackDialog } from "./switch-back-dialog.tsx";

type Engine = "this-computer" | "server";

/**
 * The paired server as this window last heard it: when it checked, the pairing's end, and the name
 * the server lists this computer by.
 */
interface Paired {
  readonly checkedAt: string;
  readonly sessionEndsAt: string;
  readonly deviceName: string;
}

/** The address's host, as the row shows it: `halonic.example.com`. */
function hostOf(address: string): string {
  try {
    return new URL(address).host;
  } catch {
    return address;
  }
}

/**
 * The name the server lists this computer by (this window's pairing, else the one the host kept),
 * and the one Pair with a server fills in: that name, else the computer's own, else the fallback.
 */
function namesOf(
  state: ServerEngineView,
  paired: Paired | undefined,
): { readonly paired: string; readonly suggested: string } {
  const kept = paired?.deviceName ?? (state.engine === "server" ? state.deviceName : undefined);
  const computer = state.engine === "keychain-needed" ? undefined : state.computerName;
  return {
    paired: kept ?? words.NAME_FALLBACK,
    suggested: kept ?? computer ?? words.NAME_FALLBACK,
  };
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
    announce(next.kind === "line" ? next.line : `${next.ending.heading} ${next.ending.text}`);
  };

  const onPaired = useCallback(
    (done: PairedAs) => {
      setPairing(undefined);
      setNote(undefined);
      const { sessionEndsAt, deviceName } = done;
      setPaired({
        checkedAt: new Date(now?.() ?? Date.now()).toISOString(),
        sessionEndsAt,
        deviceName,
      });
      announce(words.pairedLine(hostOf(done.address)));
      read();
    },
    [announce, now, read],
  );

  if (state === undefined) return null;
  const engineNow: Engine = state.engine === "server" ? "server" : "this-computer";
  const host = state.engine === "server" ? hostOf(state.address) : "";
  const names = namesOf(state, paired);

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
                reach={state.reach}
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
          computerName={names.suggested}
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
          name={names.paired}
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

/** Whether the host's last call to the server got through, and when. */
type Reach = Extract<ServerEngineView, { engine: "server" }>["reach"];

/** What {@link ServerLine} shows: the chip, its tone, the meta line and the callout's tone. */
interface LineState {
  readonly chip: string;
  readonly tone: StatusChipTone;
  readonly meta: string | undefined;
  readonly callout: "attention" | "danger" | undefined;
}

/** The pairing first, then whether the host reached the server: an unusable pairing isn't offline. */
function lineOf(
  pairing: "kept" | "missing" | "unreadable",
  reach: Reach,
  paired: Paired | undefined,
): LineState {
  const chips = connectWords.stateChips;
  if (pairing === "missing") {
    return {
      chip: chips["signed-out"],
      tone: "danger",
      meta: words.SIGNED_OUT_META,
      callout: "danger",
    };
  }
  if (pairing === "unreadable") {
    return { chip: chips["signed-out"], tone: "danger", meta: undefined, callout: "danger" };
  }
  if (reach?.state === "offline") {
    const meta = connectWords.stateMeta({ kind: "offline", asOf: reach.asOf }, undefined);
    return { chip: chips.offline, tone: "attention", meta, callout: "attention" };
  }
  const meta = paired && words.connectedMeta(paired.checkedAt, paired.sessionEndsAt);
  return { chip: chips.online, tone: "success", meta, callout: undefined };
}

/** Under Server: the host, its chip and meta line, and a callout when it can't be used or reached. */
function ServerLine({
  host,
  pairing,
  reach,
  paired,
  onPairAgain,
}: {
  readonly host: string;
  readonly pairing: "kept" | "missing" | "unreadable";
  readonly reach: Reach;
  readonly paired: Paired | undefined;
  readonly onPairAgain: () => void;
}) {
  const line = lineOf(pairing, reach, paired);
  const pairAgain = { label: words.PAIR_AGAIN, onClick: onPairAgain };
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-body-strong text-fg">{host}</span>
        <StatusChip tone={line.tone} dot>
          {line.chip}
        </StatusChip>
      </div>
      {line.meta ? <p className="m-0 text-small text-fg-muted">{line.meta}</p> : null}
      {line.callout === "attention" ? (
        <Callout tone="attention">{words.SERVER_OFFLINE_CALLOUT}</Callout>
      ) : null}
      {line.callout === "danger" ? (
        <Callout tone="danger" action={pairAgain}>
          {pairing === "missing" ? words.signedOutCallout(host) : words.KEYCHAIN_UNREADABLE}
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
