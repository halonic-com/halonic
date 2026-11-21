import type { RunEvent } from "@halonicjs/events";
import {
  useWaitedMs,
  WAITING_REASON_AFTER_MS,
  WaitingLine,
  type WaitingLineAction,
} from "@halonicjs/studio-kit";
import type { ProviderKind } from "../api.ts";
import { slowStepWords } from "../slow-step-words.ts";
import { guidedRunWords, lastModelCall, modelEscalation } from "./guided-run.ts";
import { type StepWait, stepWait } from "./slow-step.ts";

/** A guided run's escalations (`guided-run.ts`): its way out, and how to tell a local model. */
export interface WaitingLineGuide {
  /** **Pick another model**, which the line offers once a model hasn't answered for long. */
  readonly pickAnotherModel: () => void;
  /** The workspace's provider kinds, so a model on this computer gets its own, longer limits. */
  readonly providerKind: ((providerId: string) => ProviderKind | undefined) | undefined;
}

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
  /** A guided run's escalations on a model; without it the line never escalates. */
  readonly guide?: WaitingLineGuide | undefined;
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
  guide,
}: RunWaitingLineProps) {
  const wait = running && log !== undefined ? stepWait(log, phone, providerName) : undefined;
  if (wait === undefined) {
    return null;
  }
  // Only a wait on a model escalates: the last event is the model call the run waits on.
  const call =
    guide !== undefined && log?.at(-1)?.type === "llm.request"
      ? lastModelCall(log, guide.providerKind)
      : undefined;
  const escalate =
    guide === undefined || call === undefined
      ? undefined
      : { local: call.local, pickAnotherModel: guide.pickAnotherModel };
  return <CountingLine wait={wait} somethingWrong={somethingWrong} now={now} escalate={escalate} />;
}

/** The line itself, apart from the page, so only it draws again each second. */
function CountingLine({
  wait,
  somethingWrong,
  now,
  escalate,
}: {
  readonly wait: StepWait;
  readonly somethingWrong: (() => void) | undefined;
  readonly now: () => Date;
  readonly escalate: { readonly local: boolean; readonly pickAnotherModel: () => void } | undefined;
}) {
  const waitedMs = useWaitedMs(wait.since, now);
  const escalation = escalate && modelEscalation(escalate.local, waitedMs);
  const actions: WaitingLineAction[] = [
    ...(escalate !== undefined && escalation?.offersAnotherModel === true
      ? [{ label: guidedRunWords.pickAnotherModel, onClick: escalate.pickAnotherModel }]
      : []),
    ...(somethingWrong !== undefined && waitedMs >= WAITING_REASON_AFTER_MS
      ? [{ label: slowStepWords.somethingWrong, onClick: somethingWrong }]
      : []),
  ];
  const reason = escalation?.reason ?? wait.reason;
  return (
    <WaitingLine
      placement="banner"
      what={wait.what}
      waitedMs={waitedMs}
      actions={actions}
      {...(reason === undefined ? {} : { reason })}
    />
  );
}
