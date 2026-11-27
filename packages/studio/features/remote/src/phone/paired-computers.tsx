import { Button, EmptyState, LaptopIcon, PlusIcon } from "@halonicjs/studio-kit";
import { useRef, useState } from "react";
import { computerMeta, computersWords } from "./computers-words.ts";
import { ForgetDialog, forgottenWords, isUnreadable } from "./forget-dialog.tsx";
import { spoken } from "./phone-forms.ts";
import type { PhoneState } from "./phone-status.ts";
import {
  type ComputerId,
  type ForgetOutcome,
  type KeysUnavailable,
  type ListedComputer,
  type PairedComputer,
  type PhoneStatus,
  phoneStatusLabelState,
  type UnreadableComputer,
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
 * Forget, which asks once (`d-m2`) and says the computer still lists this phone. A computer this
 * phone can't read comes after them, listed only so it can be forgotten (microcopy 28). With none,
 * the empty state; when the phone's key storage doesn't work, that problem with Try again. The
 * page round it draws the header and Android back.
 */
export function PairedComputers({
  computers,
  statuses,
  onForget,
  onPair,
  onRetry,
  atFoot = true,
  now = () => new Date(),
}: {
  /** `PhoneTunnel.pairedComputers()`'s answer. */
  readonly computers: readonly ListedComputer[] | KeysUnavailable;
  /** Each computer's newest status from `PhoneTunnel.onStatus`. */
  readonly statuses: ReadonlyMap<ComputerId, PhoneStatus>;
  /** Deletes the entry (`PhoneTunnel.forget`); the page then lists the computers again. */
  readonly onForget: (computer: ListedComputer) => Promise<ForgetOutcome>;
  readonly onPair: () => void;
  /** Lists the computers again after `keys-unavailable`. */
  readonly onRetry: () => void;
  /** Whether Pair with a computer is the screen's last block, so it clears the home bar. Default yes. */
  readonly atFoot?: boolean;
  /** Where "Paired 14 Nov" counts the year from. Default the clock. */
  readonly now?: () => Date;
}) {
  const [forgetting, setForgetting] = useState<ListedComputer>();
  const [said, setSaid] = useState("");
  const forgetButtons = useRef(new Map<ComputerId, HTMLButtonElement>());
  const pairButton = useRef<HTMLButtonElement>(null);
  const emptyTitle = useRef<HTMLElement>(null);
  // Where focus goes when the sheet closes after a Forget: the next row's button, else the previous.
  const focusAfter = useRef<ComputerId | undefined>(undefined);

  if (!Array.isArray(computers)) {
    return (
      <div className="flex flex-1 flex-col justify-center px-6 py-6">
        <EmptyState
          tone="error"
          title={computersWords.keysUnavailable.title}
          description={computersWords.keysUnavailable.body}
          action={{ label: computersWords.keysUnavailable.tryAgain, onClick: onRetry }}
        />
      </div>
    );
  }
  // Readable computers first; the ones this phone can't read after them (microcopy 28).
  const listed = [
    ...computers.filter((each) => !isUnreadable(each)),
    ...computers.filter(isUnreadable),
  ];

  const forgot = (computer: ListedComputer) => {
    const index = listed.findIndex((each) => each.id === computer.id);
    focusAfter.current = (listed[index + 1] ?? listed[index - 1])?.id;
    setForgetting(undefined);
    // The same words twice in a row would change nothing, so a screen reader wouldn't say them.
    const words = forgottenWords(computer);
    setSaid((before) => (before === words ? `${words}\u00a0` : words));
  };

  const today = now();
  const unreadables = listed.filter(isUnreadable);
  return (
    <div className="flex flex-1 flex-col gap-6">
      <p className="sr-only" aria-live="polite">
        {said}
      </p>
      {listed.length === 0 ? (
        <div className="flex flex-1 flex-col justify-center px-6 py-6">
          <EmptyState
            icon={<LaptopIcon />}
            title={computersWords.empty.title}
            titleRef={emptyTitle}
            description={computersWords.empty.body}
            action={{ label: computersWords.pair, onClick: onPair }}
          />
        </div>
      ) : (
        <>
          <div className="flex flex-1 flex-col gap-4 px-6 pt-6">
            <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border p-0">
              {listed.map((computer) => {
                const onRowForget = () => setForgetting(computer);
                return isUnreadable(computer) ? (
                  <UnreadableRow
                    key={computer.id}
                    computer={computer}
                    name={computersWords.unreadable.forgetNameOf(
                      unreadables.indexOf(computer) + 1,
                      unreadables.length,
                    )}
                    buttons={forgetButtons.current}
                    onForget={onRowForget}
                  />
                ) : (
                  <ComputerRow
                    key={computer.id}
                    computer={computer}
                    state={computerRowState(computer, statuses.get(computer.id))}
                    meta={computerMeta(computer, today)}
                    buttons={forgetButtons.current}
                    onForget={onRowForget}
                  />
                );
              })}
            </ul>
            <p className="text-small text-fg-muted">{computersWords.note}</p>
          </div>
          {/* In thumb reach: 16px from the sides; at the foot, pb-safe clears the home bar. */}
          <div className={atFoot ? "px-4 pb-safe" : "px-4"}>
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
          </div>
        </>
      )}
      {forgetting === undefined ? null : (
        <ForgetDialog
          computer={forgetting}
          onForget={onForget}
          onForgotten={() => forgot(forgetting)}
          onCancel={() => setForgetting(undefined)}
          returnFocus={() => {
            const next = focusAfter.current;
            focusAfter.current = undefined;
            return (
              (next && forgetButtons.current.get(next)) || pairButton.current || emptyTitle.current
            );
          }}
        />
      )}
    </div>
  );
}

/**
 * The laptop on its 40px tile at the start of a row. It's decoration: the row's words name the
 * computer. `dim` fades only the tile, so the words and Forget keep their contrast (G16).
 */
function LaptopTile({ dim = false }: { readonly dim?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-grid size-10 shrink-0 place-items-center rounded-md bg-surface-subtle text-fg-muted ${dim ? "opacity-60" : ""}`}
    >
      <span className="inline-grid size-icon-md place-items-center *:size-full">
        <LaptopIcon />
      </span>
    </span>
  );
}

/** One computer: its tile, name, route and day, its state in words with a dot, and Forget. */
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
  // "Paired 14 Nov" stays on one line; only the route before it may wrap.
  const split = meta.lastIndexOf(" · ");
  const day = split === -1 ? 0 : split + 3;
  return (
    <li className="flex items-center gap-4 px-4 py-3">
      {/* Only Can't reach dims, and only its tile: the name, lines and Forget stay readable (G16). */}
      <LaptopTile dim={state === "unreachable"} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="sr-only">
          {state === undefined ? said : `${said}. ${computersWords.row[state]}`}
        </span>
        <div aria-hidden="true" className="flex flex-col gap-0.5">
          <p className="text-fg">{computer.name}</p>
          <p className="text-small text-fg-muted">
            {meta.slice(0, day)}
            <span className="whitespace-nowrap">{meta.slice(day)}</span>
          </p>
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

/**
 * A computer this phone can't read (microcopy 28): no name, route, day or dot, because it can't
 * be tried at all. Only its tile is faded, so its words and Forget stay readable (C667 #1). Its
 * Forget says which row it is, numbered when there are several.
 */
function UnreadableRow({
  computer,
  name,
  buttons,
  onForget,
}: {
  readonly computer: UnreadableComputer;
  /** Its Forget's name, which numbers it when there is more than one. */
  readonly name: string;
  readonly buttons: Map<ComputerId, HTMLButtonElement>;
  readonly onForget: () => void;
}) {
  return (
    <li className="flex items-center gap-4 px-4 py-3">
      <LaptopTile dim />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-fg">{computersWords.unreadable.name}</p>
        <p className="text-small text-fg-muted">{computersWords.unreadable.body}</p>
      </div>
      <Button
        variant="ghost"
        size="touch"
        name={name}
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
