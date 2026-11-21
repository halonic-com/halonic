import { copyText, type ToastMessage, type ToastStore } from "@halonicjs/studio-kit";
import { engineWordsOf, startFailureOf, withFullStop } from "@halonicjs/studio-shell";
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
 * started run offers **Open run**; a refusal or a start that failed stays until it is dismissed
 * ({@link startFailedToast}). A host without an engine has no Run now, so there is nothing to start.
 */
export async function runRoutineNow(
  host: RoutinesHost,
  toasts: ToastStore | null,
  routine: RunNowRoutine,
  openRun: ((runId: string) => void) | undefined,
  /** Set on the start that follows trusting the workspace, so a second refusal can't loop. */
  trustedJustNow = false,
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
    const { refusal } = result;
    if (refusal.reason === "not-trusted" && host.askTrust !== undefined && !trustedJustNow) {
      // The workspace's one gate opens instead of a toast; Not now leaves the toast's sentence.
      if ((await host.askTrust()) === "trusted") {
        return runRoutineNow(host, toasts, routine, openRun, true);
      }
    }
    toasts?.show({
      tone: "danger",
      title: refusalSentence(refusal, routine),
      sticky: true,
      ...signInStep(host.signIn?.bind(host), toasts, refusal),
    });
  } catch (error) {
    toasts?.show(
      startFailedToast(error, routine, () => runRoutineNow(host, toasts, routine, openRun)),
    );
  }
}

/**
 * The toast of a start that failed (UX check S3 and S5, HAL-12390): "Couldn't start *Daily*.", then
 * the reason with the next step and its command after it, as the Run panel's shared start-failure
 * line has them (`startFailureOf`). So the window's refusal keeps its own words and only an engine
 * that can't be reached says it isn't answering. A toast has no room for a CommandBox, so the
 * command ends the line and **Copy command** copies it; a start that may work a second time, such
 * as a workspace another Halonic was running, offers **Try again**.
 */
function startFailedToast(
  error: unknown,
  routine: RunNowRoutine,
  tryAgain: () => Promise<void>,
): ToastMessage {
  const { notAnswering } = engineWordsOf({});
  const { fix, command, tryAgain: mayWork } = startFailureOf(error, notAnswering);
  const text = [
    failureReason(error, notAnswering),
    fix === undefined ? undefined : withFullStop(fix),
    command,
  ]
    .filter((part) => part !== undefined)
    .join(" ");
  const copyCommand =
    command === undefined
      ? undefined
      : {
          label: runNowWords.copyCommand,
          onClick: () => void copyText(command),
          keepOpen: true,
        };
  const retry = mayWork
    ? { label: runNowWords.tryAgain, onClick: () => void tryAgain() }
    : undefined;
  const [action, secondAction] = [retry, copyCommand].filter((one) => one !== undefined);
  return {
    tone: "danger",
    title: runNowWords.couldntStart(routine.name),
    text,
    sticky: true,
    ...(action && { action }),
    ...(secondAction && { secondAction }),
  };
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
