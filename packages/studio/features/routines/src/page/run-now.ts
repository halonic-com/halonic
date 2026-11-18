import type { ToastMessage, ToastStore } from "@halonicjs/studio-kit";
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
    case "agent-runs-not-available":
      return runNowWords.agentRunsNotAvailable;
  }
}

/** What the page can do from a Run now toast; a step it can't take shows no button. */
export interface RunNowSteps {
  /** Opens a started run, for **Open run**. */
  readonly openRun?: ((runId: string) => void) | undefined;
  /** Shows the Starts picker, for **Pick what it runs** on a target that can't start. */
  readonly pickTarget?: (() => void) | undefined;
}

/**
 * Starts the routine's target now (flow-routines 3.8) and says what happened with a toast: a
 * started run offers **Open run**; a refusal or an engine that doesn't answer stays until it is
 * dismissed, and a refusal of an agent offers **Pick what it runs**. A host without an engine has
 * no Run now, so there is nothing to start.
 */
export async function runRoutineNow(
  host: RoutinesHost,
  toasts: ToastStore | null,
  routine: RunNowRoutine,
  steps: RunNowSteps,
  /** Set on the start that follows trusting the workspace, so a second refusal can't loop. */
  trustedJustNow = false,
): Promise<void> {
  const { openRun } = steps;
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
    const { refusal } = result;
    if (refusal.reason === "not-trusted" && host.askTrust !== undefined && !trustedJustNow) {
      // The workspace's one gate opens instead of a toast; Not now leaves the toast's sentence.
      if ((await host.askTrust()) === "trusted") {
        return runRoutineNow(host, toasts, routine, steps, true);
      }
    }
    toasts?.show({
      tone: "danger",
      title: refusalSentence(refusal, routine),
      sticky: true,
      ...signInStep(host.signIn?.bind(host), toasts, refusal),
      ...pickTargetStep(steps.pickTarget, refusal),
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

/**
 * **Pick what it runs** on a refusal of an agent: the routine can start once it runs a workflow,
 * and trying again can't help, so the toast has no **Try again** (microcopy 1.1, rule N6).
 */
function pickTargetStep(
  pickTarget: RunNowSteps["pickTarget"],
  refusal: RunNowRefusal,
): Pick<ToastMessage, "action"> {
  if (refusal.reason !== "agent-runs-not-available" || pickTarget === undefined) return {};
  return { action: { label: runNowWords.pickTarget, onClick: pickTarget } };
}

/** **Sign in with Google** on a signed-out refusal, where the host can run the sign-in. */
function signInStep(
  signIn: RoutinesHost["signIn"],
  toasts: ToastStore | null,
  refusal: RunNowRefusal,
): Pick<ToastMessage, "action"> {
  if (refusal.reason !== "signed-out" || signIn === undefined) return {};
  const { account } = refusal;
  return {
    action: {
      label: runNowWords.signIn,
      onClick: () => {
        signIn(account).catch((error: unknown) => {
          toasts?.show({
            tone: "danger",
            title: runNowWords.couldntSignIn(account),
            text: failureReason(error),
          });
        });
      },
    },
  };
}
