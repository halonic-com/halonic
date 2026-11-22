import { Dialog, useToastStore } from "@halonicjs/studio-kit";
import { useEffect, useRef, useState } from "react";
import type { RoutinesHost, RoutineView } from "../api.ts";
import { deviceTimeZone, nextTime } from "../when/when-words.ts";
import { failureReason, runDialogWords } from "./page-words.ts";

/**
 * Why Run now asks first (flow-routines 3.8): the routine has changes that aren't live, or has
 * never had a version. `undefined` when it starts at once, which is also the case where the host
 * can't make a routine live, since the dialog would have nothing to offer.
 */
export function runDialogReason(
  host: RoutinesHost,
  routine: RoutineView,
): "changes" | "never-live" | undefined {
  if (host.makeLive === undefined) return undefined;
  if (!routine.everLive) return "never-live";
  return routine.changesNotLive ? "changes" : undefined;
}

/** When the live version was made: the time of day for today, else the day with it. */
function liveTime(iso: string, now: Date = new Date()): string {
  const moment = new Date(iso);
  if (moment.toDateString() !== now.toDateString()) {
    return nextTime(iso, undefined, deviceTimeZone());
  }
  return moment.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** Props for {@link RunDialog}. */
export interface RunDialogProps {
  readonly host: RoutinesHost;
  /** The routine as the page reads it now, so the dialog follows a version made while it is open. */
  readonly routine: RoutineView;
  /** Starts the run; the dialog is closed by the page once it has. */
  readonly onRun: () => void;
  readonly onCancel: () => void;
}

/**
 * The dialog Run now opens for a routine that isn't fully live: it says which version runs, and
 * offers **Make live first** (Create version with only this routine; the dialog comes back with
 * the new live time) or, for a routine that never had a version, **Make live and run**. Cancel
 * changes nothing.
 */
export function RunDialog({ host, routine, onRun, onCancel }: RunDialogProps) {
  const toasts = useToastStore();
  // Only the button that was pressed is busy: Make live and run, or Make live first, which leaves
  // Run now as it reads while Create version is open (RT7 of HAL-15304).
  const [making, setMaking] = useState<"and-run" | "first" | undefined>();
  // Counts the versions Make live first made, so Run now takes the focus once the dialog is back.
  const [madeFirst, setMadeFirst] = useState(0);
  const body = useRef<HTMLSpanElement>(null);
  const neverLive = !routine.everLive;

  useEffect(() => {
    if (madeFirst > 0) runNowButton(body.current)?.focus();
  }, [madeFirst]);

  /** Makes the routine live; answers whether a version was made. */
  async function makeLive(pressed: "and-run" | "first"): Promise<boolean> {
    if (host.makeLive === undefined || making !== undefined) return false;
    setMaking(pressed);
    try {
      return (await host.makeLive(routine)) === "made";
    } catch (error) {
      toasts?.show({
        tone: "danger",
        title: runDialogWords.couldntMakeLive(routine.name),
        text: failureReason(error),
      });
      return false;
    } finally {
      setMaking(undefined);
    }
  }

  async function makeLiveFirst() {
    if (await makeLive("first")) setMadeFirst((count) => count + 1);
  }

  async function confirm() {
    if (neverLive && !(await makeLive("and-run"))) return;
    onRun();
  }

  return (
    <Dialog
      title={runDialogWords.title(routine.name)}
      confirm={{
        label: neverLive ? runDialogWords.makeLiveAndRun : runDialogWords.runNow,
        busyLabel: neverLive ? runDialogWords.makeLiveBusy : runDialogWords.runBusy,
      }}
      {...(!neverLive &&
        routine.changesNotLive && {
          alternative: { label: runDialogWords.makeLiveFirst, onClick: () => void makeLiveFirst() },
        })}
      busy={making === "and-run"}
      onConfirm={() => void confirm()}
      onCancel={onCancel}
    >
      <span ref={body}>
        {neverLive ? (
          runDialogWords.neverLive(routine.name)
        ) : (
          <>
            {runDialogWords.runsLive(
              routine.liveSince === undefined ? undefined : liveTime(routine.liveSince),
            )}
            {routine.changesNotLive && ` ${runDialogWords.notInIt}`}
          </>
        )}
      </span>
    </Dialog>
  );
}

/**
 * The run dialog's **Run now**, found from inside its body: the kit's Dialog doesn't hand out its
 * confirming button, and Create version, which Make live first opens on top, gives the focus back
 * to a button that has gone.
 */
function runNowButton(inside: HTMLElement | null): HTMLButtonElement | undefined {
  const buttons = inside?.closest("dialog")?.querySelectorAll<HTMLButtonElement>("footer button");
  // The button holds its busy label too, to keep its width, so its text starts with its label.
  return [...(buttons ?? [])].find((button) =>
    button.textContent?.startsWith(runDialogWords.runNow),
  );
}
