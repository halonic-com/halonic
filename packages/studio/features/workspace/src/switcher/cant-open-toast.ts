import type { ToastAction, ToastStore } from "@halonicjs/studio-kit";
import {
  copyDetails,
  copyDetailsWords,
  offersRemoveFromRecent,
  removeFromRecentLabel,
  type WelcomeOpenProblem,
} from "@halonicjs/studio-shell";

/** The toast action that shows the folder picker, as the menu's "Open a folder…" does. */
export const openFolderLabel = "Open folder";

/** What a failed open's toast can do from the workspace menu. */
export interface CantOpenToastParts {
  readonly toasts: ToastStore;
  /** Drops the folder's Recent row, as **Remove from Recent** does. */
  readonly removeFromRecent: (location: string) => void;
  /** Shows the folder picker again, as **Open folder** does. */
  readonly pickAgain: () => void;
}

/**
 * Shows why a folder didn't open in a danger toast that stays until closed (states-flow-map E1
 * to E4): "Can't open acme: …", with the fix as its text when there is one (HAL-15232). A Recent
 * row whose folder is gone, or inside the profile folder, offers **Remove from Recent** (E2), one
 * whose folder has to be picked again offers **Open folder** (HAL-7058), and a reason Halonic
 * can't explain offers **Copy details** (E4).
 */
export function showCantOpenToast(
  parts: CantOpenToastParts,
  problem: WelcomeOpenProblem,
  fromRecent: boolean,
): void {
  const action = cantOpenAction(parts, problem, fromRecent);
  parts.toasts.show({
    tone: "danger",
    title: `Can't open ${problem.folder}: ${problem.reason}`,
    ...(problem.fix === undefined ? {} : { text: problem.fix }),
    ...(action === undefined ? {} : { action }),
  });
}

/** The failed open's toast action: Copy details, Remove from Recent, Open folder, or none. */
function cantOpenAction(
  parts: CantOpenToastParts,
  problem: WelcomeOpenProblem,
  fromRecent: boolean,
): ToastAction | undefined {
  const { details } = problem;
  if (details !== undefined) {
    return {
      label: copyDetailsWords.label,
      onClick: () => void copyDetails(details, parts.toasts),
    };
  }
  if (fromRecent && offersRemoveFromRecent(problem)) {
    return { label: removeFromRecentLabel, onClick: () => parts.removeFromRecent(problem.folder) };
  }
  if (problem.pickAgain === true) {
    return { label: openFolderLabel, onClick: parts.pickAgain };
  }
  return undefined;
}
