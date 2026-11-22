import { Button, Dialog, EmptyState, PlusIcon } from "@halonicjs/studio-kit";
import { useRef, useState } from "react";
import { computerMeta, computersWords } from "./computers-words.ts";
import { spoken } from "./phone-forms.ts";
import type { PhoneState } from "./phone-status.ts";
import {
  type ComputerId,
  type PairedComputer,
  type PhoneStatus,
  phoneStatusLabelState,
} from "./phone-tunnel.ts";

/**
 * A row's state: the computer's standing first, because Removed and Can't confirm hold until the
 * person acts, then its connection. No state for a computer that isn't connecting (`closed`) or
 * while the app is paused.
 */
export function computerRowState(
  computer: PairedComputer,
  status: PhoneStatus | undefined,
): PhoneState | undefined {
  if (computer.standing === "removed") return "removed";
  if (computer.standing === "cant-confirm") return "cantConfirm";
  if (status === undefined) return undefined;
  const state = phoneStatusLabelState(status);
  return state === "keep" || state === "none" ? undefined : state;
}

/** The dot's colour; the words always say the state too (G16). */
const dotTone: Record<PhoneState, string> = {
  connected: "text-success",
  reconnecting: "text-attention",
  unreachable: "text-attention",
  phoneOffline: "text-attention",
  removed: "text-danger",
  cantConfirm: "text-danger",
};

/**
 * `d-m1` to `d-m3`: the paired computers, each with its route, the day it paired, its state and
 * Forget, which asks once (`d-m2`) and says the computer still lists this phone. With none, the
 * empty state. The page round it draws the header and Android back.
 */
export function PairedComputers({
  computers,
  statuses,
  onForget,
  onPair,
  now = () => new Date(),
}: {
  readonly computers: readonly PairedComputer[];
  /** Each computer's newest status from `PhoneTunnel.onStatus`. */
  readonly statuses: ReadonlyMap<ComputerId, PhoneStatus>;
  /** Deletes the entry (`PhoneTunnel.forget`); the page then lists the computers again. */
  readonly onForget: (computer: PairedComputer) => Promise<void>;
  readonly onPair: () => void;
  /** Where "Paired 14 Nov" counts the year from. Default the clock. */
  readonly now?: () => Date;
}) {
  const [forgetting, setForgetting] = useState<PairedComputer>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const forgetButtons = useRef(new Map<ComputerId, HTMLButtonElement>());
  const pairButton = useRef<HTMLButtonElement>(null);
  const emptyTitle = useRef<HTMLElement>(null);
  // Where focus goes when the sheet closes after a Forget: the next row's button, else the previous.
  const focusAfter = useRef<ComputerId | undefined>(undefined);

  const confirm = async (computer: PairedComputer) => {
    setBusy(true);
    setError(undefined);
    try {
      await onForget(computer);
    } catch {
      setBusy(false);
      setError(computersWords.forget.failed(computer.name));
      return;
    }
    const index = computers.findIndex((each) => each.id === computer.id);
    focusAfter.current = (computers[index + 1] ?? computers[index - 1])?.id;
    setBusy(false);
    setForgetting(undefined);
  };

  const today = now();
  return (
    <div className="flex min-h-full flex-col gap-6 px-6 py-6">
      {computers.length === 0 ? (
        <div className="flex flex-1 flex-col justify-center">
          <EmptyState
            title={computersWords.empty.title}
            titleRef={emptyTitle}
            description={computersWords.empty.body}
            action={{ label: computersWords.pair, onClick: onPair }}
          />
        </div>
      ) : (
        <>
          <div className="flex flex-1 flex-col gap-4">
            <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border p-0">
              {computers.map((computer) => (
                <ComputerRow
                  key={computer.id}
                  computer={computer}
                  state={computerRowState(computer, statuses.get(computer.id))}
                  meta={computerMeta(computer, today)}
                  buttons={forgetButtons.current}
                  onForget={() => {
                    setError(undefined);
                    setForgetting(computer);
                  }}
                />
              ))}
            </ul>
            <p className="text-small text-fg-muted">{computersWords.note}</p>
          </div>
          <Button
            variant="primary"
            size="touch"
            block
            ref={pairButton}
            icon={<PlusIcon />}
            onClick={onPair}
          >
            {computersWords.pair}
          </Button>
        </>
      )}
      {forgetting === undefined ? null : (
        <Dialog
          size="sm"
          title={computersWords.forget.title(forgetting.name)}
          confirm={{
            label: computersWords.forget.confirm,
            variant: "danger",
            busyLabel: computersWords.forget.busy,
          }}
          cancelLabel={computersWords.forget.cancel}
          busy={busy}
          {...(error === undefined ? {} : { error })}
          returnFocus={() => {
            const next = focusAfter.current;
            focusAfter.current = undefined;
            return (
              (next && forgetButtons.current.get(next)) || pairButton.current || emptyTitle.current
            );
          }}
          onConfirm={() => void confirm(forgetting)}
          onCancel={() => setForgetting(undefined)}
        >
          <p>{computersWords.forget.body}</p>
          <p className="text-fg-muted">{computersWords.forget.stillPaired}</p>
        </Dialog>
      )}
    </div>
  );
}

/** One computer: its name, route and day, its state in words with a dot, and Forget. */
function ComputerRow({
  computer,
  state,
  meta,
  buttons,
  onForget,
}: {
  readonly computer: PairedComputer;
  readonly state: PhoneState | undefined;
  readonly meta: string;
  /** Each row's Forget button by computer id, for where focus goes after one. */
  readonly buttons: Map<ComputerId, HTMLButtonElement>;
  readonly onForget: () => void;
}) {
  const said = [computer.name, spoken(meta).replace("Paired", "paired")].join(", ");
  return (
    // Only Can't reach dims: Removed and Can't confirm keep a working Forget (G16).
    <li
      className={`flex items-center gap-4 px-4 py-3 ${state === "unreachable" ? "opacity-60" : ""}`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="sr-only">
          {state === undefined ? said : `${said}. ${computersWords.row[state]}`}
        </span>
        <div aria-hidden="true" className="flex flex-col gap-0.5">
          <p className="text-fg">{computer.name}</p>
          <p className="text-small text-fg-muted">{meta}</p>
          {state === undefined ? null : (
            <p className="flex items-center gap-2 text-small text-fg">
              <span
                className={`size-2 shrink-0 rounded-full bg-current forced-color-adjust-none forced-colors:bg-[CanvasText] ${dotTone[state]}`}
              />
              {computersWords.row[state]}
            </p>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="touch"
        // Names the computer for a screen reader, so each row's Forget differs.
        name={`${computersWords.row.forget} ${computer.name}`}
        ref={(node) => {
          if (node) buttons.set(computer.id, node);
          else buttons.delete(computer.id);
        }}
        onClick={onForget}
      >
        {computersWords.row.forget}
      </Button>
    </li>
  );
}
