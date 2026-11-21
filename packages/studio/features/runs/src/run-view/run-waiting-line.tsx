import type { RunEvent } from "@halonicjs/events";
import {
  useWaitedMs,
  WAITING_REASON_AFTER_MS,
  WaitingLine,
  type WaitingLineAction,
} from "@halonicjs/studio-kit";
import { slowStepWords } from "../slow-step-words.ts";
import { type StepWait, stepWait } from "./slow-step.ts";

/** The props of {@link RunWaitingLine}. */
export interface RunWaitingLineProps {
  readonly log: readonly RunEvent[] | undefined;
  /** Only a running run waits; an ended one never shows the line. */
  readonly running: boolean;
  /** On a phone, a model on the computer says so: "Waiting for Ollama on your computer". */
  readonly phone: boolean;
  /**
   * Opens Check this computer, for **Something wrong?** after 10 seconds. It's the one switch for
   * that action: nothing passes it until the dialog lands (HAL-13411), so the line leaves it out.
   */
  readonly somethingWrong: (() => void) | undefined;
  /** The workspace's provider names, so a model call names its provider as the banners do. */
  readonly providerName: ((providerId: string) => string | undefined) | undefined;
  /** The clock; tests pass a fixed one. */
  readonly now: () => Date;
}

/**
 * The kit's WaitingLine above the run's receipt (first-run-progress 3.3): from 2 seconds it names
 * what the step waits for, with the time, and for a model on this computer the reason joins at
 * 10 seconds. It's mounted as soon as the last event names a wait, so its status region is there
 * before the words arrive.
 */
export function RunWaitingLine({
  log,
  running,
  phone,
  somethingWrong,
  providerName,
  now,
}: RunWaitingLineProps) {
  const wait = running && log !== undefined ? stepWait(log, phone, providerName) : undefined;
  if (wait === undefined) {
    return null;
  }
  return <CountingLine wait={wait} somethingWrong={somethingWrong} now={now} />;
}

/** The line itself, apart from the page, so only it draws again each second. */
function CountingLine({
  wait,
  somethingWrong,
  now,
}: {
  readonly wait: StepWait;
  readonly somethingWrong: (() => void) | undefined;
  readonly now: () => Date;
}) {
  const waitedMs = useWaitedMs(wait.since, now);
  const actions: WaitingLineAction[] =
    somethingWrong !== undefined && waitedMs >= WAITING_REASON_AFTER_MS
      ? [{ label: slowStepWords.somethingWrong, onClick: somethingWrong }]
      : [];
  return (
    <WaitingLine
      placement="banner"
      what={wait.what}
      waitedMs={waitedMs}
      actions={actions}
      {...(wait.reason === undefined ? {} : { reason: wait.reason })}
    />
  );
}
