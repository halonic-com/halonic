import type { ToastStore } from "@halonicjs/studio-kit";
import type { RoutinesHost, RoutineView, RunNowRefusal } from "../api.ts";
import { failureReason, runNowWords } from "./page-words.ts";

/** The routine facts a Run now toast names. */
export type RunNowRoutine = Pick<RoutineView, "hubId" | "id" | "name" | "targetName">;

/** The one sentence a refusal is shown as. */
function refusalSentence(refusal: RunNowRefusal, routine: RunNowRoutine): string {
  switch (refusal.reason) {
    case "signed-out":
      return runNowWords.signedOut(refusal.account);
    case "not-trusted":
      return runNowWords.notTrusted(routine.name);
    case "target-not-found":
      return runNowWords.targetNotFound(routine.targetName);
    case "target-never-live":
      return runNowWords.targetNeverLive(routine.targetName);
    case "target-in-trash":
      return runNowWords.targetInTrash(routine.targetName);
  }
}

/**
 * Starts the routine's target now (flow-routines 3.8) and says what happened with a toast: a
 * started run offers **Open run**; a refusal or an engine that doesn't answer stays until it is
 * dismissed. A host without an engine has no Run now, so there is nothing to start.
 */
export async function runRoutineNow(
  host: RoutinesHost,
  toasts: ToastStore | null,
  routine: RunNowRoutine,
  openRun: ((runId: string) => void) | undefined,
): Promise<void> {
  if (host.runNow === undefined) return;
  try {
    const result = await host.runNow(routine);
    if (result.started) {
      toasts?.show({
        tone: "success",
        title: runNowWords.started(routine.name, result.shortId),
        ...(openRun && {
          action: { label: runNowWords.openRun, onClick: () => openRun(result.runId) },
        }),
      });
      return;
    }
    toasts?.show({
      tone: "danger",
      title: refusalSentence(result.refusal, routine),
      sticky: true,
    });
  } catch (error) {
    toasts?.show({
      tone: "danger",
      title: runNowWords.couldntStart(routine.name),
      text: failureReason(error),
      sticky: true,
    });
  }
}
