import { Button, Field, Input, RadioGroup, type RadioOption } from "@halonicjs/studio-kit";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { linkRowClasses } from "./first-reach.tsx";
import { MarkedText } from "./marked-text.tsx";
import type { NearbyComputers } from "./nearby-computers.ts";
import { pairWords } from "./pair-words.ts";
import {
  cleanTypedCode,
  type PhonePairingFlow,
  type PickedComputer,
  type TypedDraft,
} from "./pairing-flow.ts";
import type { TypedStep as TypedView } from "./pairing-screens.tsx";
import type { KeysUnavailable, ListedComputer, PairedComputer } from "./phone-tunnel.ts";
import { type NearbyView, useNearby } from "./use-nearby.ts";

/** How many characters a pairing code has, without spaces. */
const CODE_LENGTH = 12;

/** One computer in the picker, with the radio value that names it. */
interface PickerRow {
  readonly value: string;
  readonly route: "wifi" | "pairedBefore";
  readonly computer: PickedComputer;
}

/**
 * `p-m5`, and `p-m9` with the wrong code's error: the Computer list of computers on this Wi-Fi and
 * computers paired before, the Code field, and Pair, unavailable with its reason until both are
 * filled in (G11). It browses for computers on this Wi-Fi only while it shows (G10, G23).
 */
export function TypedStep({
  step,
  flow,
  nearby,
  computers,
  onEnterAddress,
}: {
  readonly step: TypedView;
  readonly flow: PhonePairingFlow;
  /** The shell's list of computers on this Wi-Fi; none outside the Android app. */
  readonly nearby: NearbyComputers | undefined;
  /** The paired list, for "Paired before". */
  readonly computers: readonly ListedComputer[] | KeysUnavailable | undefined;
  readonly onEnterAddress: () => void;
}) {
  const found = useNearby(nearby);
  const rows = [...wifiRows(found), ...pairedRows(computers)];
  const draft = flow.typedDraft;
  const [picked, setPicked] = useState<string | null>(() => draftValue(draft, rows));
  const [code, setCode] = useState(draft?.code ?? "");
  const chosen = rows.find((row) => row.value === picked);
  const complete = chosen !== undefined && cleanTypedCode(code).length === CODE_LENGTH;
  const pair = (event: FormEvent) => {
    event.preventDefault();
    if (complete) flow.pairTyped(code, chosen.computer);
  };
  return (
    <form className="flex flex-1 flex-col gap-6" onSubmit={pair} noValidate>
      <div className="flex flex-1 flex-col gap-6 px-6 pt-6">
        <p className="text-body text-fg">
          <MarkedText text={pairWords.typed.intro} />
        </p>
        <div className="flex flex-col gap-2">
          <Field label={pairWords.typed.computerLabel} hint={nearbyOffHint(found)}>
            <ComputerList rows={rows} picked={chosen?.value ?? null} onPick={setPicked} />
          </Field>
          {found.start.kind === "asking" ? (
            <p className="text-small text-fg-muted">{pairWords.typed.nearbyReason}</p>
          ) : null}
          <WifiLine found={found} />
          <button type="button" className={`${linkRowClasses} self-start`} onClick={onEnterAddress}>
            {pairWords.typed.notListed}
          </button>
        </div>
        <CodeField code={code} triesLeft={step.triesLeft} onChange={setCode} />
      </div>
      <PairAction complete={complete} />
    </form>
  );
}

/** Pair at the foot, unavailable with its reason until the form is complete (G11). */
function PairAction({ complete }: { readonly complete: boolean }) {
  const reasonId = useId();
  return (
    <div className="flex flex-col gap-2 px-4 pb-safe">
      {complete ? null : (
        <p id={reasonId} className="text-small text-fg-muted">
          {pairWords.typed.pairReason}
        </p>
      )}
      <Button
        type="submit"
        variant="primary"
        size="touch"
        block
        unavailable={complete ? undefined : { reason: reasonId }}
      >
        {pairWords.typed.pair}
      </Button>
    </div>
  );
}

/** The Code field, with its spoken hint and the wrong code's error (`p-m9`). */
function CodeField({
  code,
  triesLeft,
  onChange,
}: {
  readonly code: string;
  readonly triesLeft: number | undefined;
  readonly onChange: (code: string) => void;
}) {
  const hintId = useId();
  return (
    <>
      <Field
        label={pairWords.typed.codeLabel}
        error={triesLeft === undefined ? null : pairWords.typed.wrong(triesLeft)}
      >
        <Input
          value={code}
          onChange={(event) => onChange(event.target.value)}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          mono
          describedBy={hintId}
        />
      </Field>
      {/* Spoken only (G11). */}
      <span id={hintId} className="sr-only">
        {pairWords.typed.codeHint}
      </span>
    </>
  );
}

/** The Computer radio group, a row per computer with its route under its name. */
function ComputerList({
  rows,
  picked,
  onPick,
}: {
  readonly rows: readonly PickerRow[];
  readonly picked: string | null;
  readonly onPick: (value: string) => void;
}) {
  if (rows.length === 0) return null;
  const options: RadioOption[] = rows.map((row) => ({
    value: row.value,
    label: (
      <>
        <span className="block">{row.computer.name}</span>
        {/* Read as "Tim's laptop, This Wi-Fi" (strings table, `p-m5`). */}
        <span className="sr-only">, </span>
        <span className="block text-small text-fg-muted">{pairWords.typed.route[row.route]}</span>
      </>
    ),
  }));
  return <RadioGroup layout="rows" options={options} value={picked} onChange={onPick} />;
}

/**
 * In place of this Wi-Fi's computers while none is listed: "Looking for computers…" said once,
 * then "No computers found yet" while it keeps looking (G10). Nothing while Android asks, and
 * nothing when Nearby devices isn't allowed: the hint under the list says why instead (G23).
 */
function WifiLine({ found }: { readonly found: NearbyView }): ReactNode {
  const { start } = found;
  if (start.kind === "asking" || start.kind === "no-local-network") return null;
  if (found.computers.length > 0) return null;
  if (start.kind === "browsing" && !found.searched) {
    return (
      <p role="status" className="text-body text-fg-muted">
        {pairWords.typed.looking}
      </p>
    );
  }
  return (
    <p className="text-body text-fg-muted">
      <MarkedText text={pairWords.typed.noneFound} />
    </p>
  );
}

/** After Don't allow: how to allow Nearby devices, the way Android still allows (G23). */
function nearbyOffHint({ start }: NearbyView): string | undefined {
  if (start.kind !== "no-local-network") return undefined;
  return start.askAgain ? pairWords.typed.nearbyOffAsk : pairWords.typed.nearbyOffSettings;
}

function wifiRows({ computers }: NearbyView): PickerRow[] {
  return computers.map((computer) => ({
    value: `wifi:${computer.id}`,
    route: "wifi",
    computer: { name: computer.name, nearby: computer.id },
  }));
}

/** Computers paired before that the phone has an address for, by the first one. */
function pairedRows(computers: readonly ListedComputer[] | KeysUnavailable | undefined) {
  if (!Array.isArray(computers)) return [];
  return computers
    .filter((listed): listed is PairedComputer => listed.standing !== "unreadable")
    .flatMap((computer): PickerRow[] => {
      const endpoint = computer.endpoints[0];
      if (endpoint === undefined) return [];
      return [
        {
          value: `paired:${computer.id}`,
          route: "pairedBefore",
          computer: { name: computer.name, endpoint, wifi: false },
        },
      ];
    });
}

/** The row the last typed pairing picked, so a wrong code keeps it (`p-m9`). */
function draftValue(draft: TypedDraft | undefined, rows: readonly PickerRow[]): string | null {
  if (draft === undefined) return null;
  const { computer } = draft;
  if ("nearby" in computer) return `wifi:${computer.nearby}`;
  const row = rows.find(
    (each) => "endpoint" in each.computer && each.computer.endpoint === computer.endpoint,
  );
  return row?.value ?? null;
}
