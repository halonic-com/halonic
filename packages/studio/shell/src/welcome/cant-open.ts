import { type ErrorKind, errorKindOf } from "@halonicjs/std";
import { detailsOf } from "../errors/copy-details-words.ts";

/** Why a folder didn't open: its folder as the user knows it and the reason, "the folder is gone." */
export interface WelcomeOpenProblem {
  readonly folder: string;
  readonly reason: string;
  /** The error's kind; `not_found` is the one a Recent row offers **Remove from Recent** for. */
  readonly kind: ErrorKind;
  /** What **Copy details** copies, only when the error has no kind (microcopy 22 F13). */
  readonly details?: string;
  /**
   * True when the app won't reopen a Recent row's folder until the user picks it again, which
   * **Open folder** does (HAL-7058).
   */
  readonly pickAgain?: true;
  /** The next step, after the reason: what to move, and which variable to set (HAL-15232). */
  readonly fix?: string;
  /**
   * True when the folder will never open from where it is, so a Recent row offers **Remove from
   * Recent** as for a gone folder: a workspace inside the profile folder (HAL-15232).
   */
  readonly removeFromRecent?: true;
}

/** The reasons microcopy 3.2 and 22 F13 fix after "Can't open *folder*: ". */
export const cantOpenWords = {
  gone: "the folder is gone.",
  denied: "you don't have permission to read it.",
  pickAgain: "pick the folder again.",
  unexplained: "Halonic ran into a problem it can't explain yet.",
  /** Said for a folder and for the sample alike once the engine has been silent for {@link engineWaitMs}. */
  silent: "the engine isn't answering. It may still be starting.",
  /** A variable moved the profile folder into the folder (HAL-15201, words decided on HAL-15232). */
  profileInside: "your profile folder is inside it.",
  /** The folder is the profile folder or inside it. */
  insideProfile: "it's inside your profile folder, where Halonic keeps its own files.",
  insideProfileFix: "Move the workspace out of it, then open it from its new place.",
} as const;

/**
 * The fix for a folder that holds the profile folder: it always says to set `HALONIC_HOME`, and
 * first names the variable that put the profile there when that's another one (HAL-15232).
 *
 * @example
 * profileInsideFix("XDG_DATA_HOME");
 * // "XDG_DATA_HOME puts it there. A change to this workspace could change what you trust. …"
 */
export function profileInsideFix(movedBy?: string): string {
  const fix =
    "A change to this workspace could change what you trust. Move the profile folder out, set HALONIC_HOME to its new place, then quit Halonic and open it again.";
  return movedBy === undefined || movedBy === "HALONIC_HOME"
    ? fix
    : `${movedBy} puts it there. ${fix}`;
}

/** Whether a Recent row whose folder failed to open offers **Remove from Recent**. */
export function offersRemoveFromRecent(problem: WelcomeOpenProblem): boolean {
  return problem.kind === "not_found" || problem.removeFromRecent === true;
}

/** How long a press stays busy, trying again by itself, before Welcome says the engine isn't answering. */
export const engineWaitMs = 10_000;

/**
 * The problem to show when a folder fails to open (`shell.welcome.cant-open`, states-flow-map D7):
 * a folder that isn't there is "gone", one the user can't read is "you don't have permission",
 * an engine that doesn't answer (`unavailable`) says so, never in the error's own words, an error
 * without a kind is the F13 sentence with its details for **Copy details**, and any
 * other kind says the engine's own message, which is safe to show.
 *
 * @example
 * cantOpenProblem("/work/old", new KindedError("not_found", "No such folder: /work/old"));
 * // { folder: "/work/old", reason: "the folder is gone.", kind: "not_found" }
 */
export function cantOpenProblem(folder: string, error: unknown): WelcomeOpenProblem {
  const placed = profilePlaceProblem(folder, error);
  if (placed !== undefined) return placed;
  const kind = errorKindOf(error);
  switch (kind) {
    case "not_found":
      return { folder, kind, reason: cantOpenWords.gone };
    case "denied":
      return { folder, kind, reason: cantOpenWords.denied };
    case "unavailable":
      return { folder, kind, reason: cantOpenWords.silent };
    case "internal":
      return {
        folder,
        kind,
        reason: cantOpenWords.unexplained,
        details: detailsOf(`Can't open ${folder}`, error),
      };
    default: {
      const message = (error as { message: string }).message;
      return { folder, kind, reason: message.endsWith(".") ? message : `${message}.` };
    }
  }
}

/**
 * The problem to show when the app can't reopen a Recent row's folder (HAL-7058): one the user has
 * to pick again first, a `conflict`, says "pick the folder again."; anything else reads as for
 * {@link cantOpenProblem}.
 *
 * @example
 * cantReopenProblem("/work/acme", new KindedError("conflict", "The shell refused: not picked"));
 * // { folder: "/work/acme", reason: "pick the folder again.", kind: "conflict", pickAgain: true }
 */
export function cantReopenProblem(folder: string, error: unknown): WelcomeOpenProblem {
  const kind = errorKindOf(error);
  if (kind === "conflict") {
    return { folder, kind, reason: cantOpenWords.pickAgain, pickAgain: true };
  }
  return cantOpenProblem(folder, error);
}

/**
 * The problem for a folder the shell refused for the profile folder's place (HAL-15201): its
 * refusal, `profile_inside` or `workspace_inside_profile`, comes as the error itself from a pick,
 * or as its cause from a reopen. `undefined` for any other error.
 */
function profilePlaceProblem(folder: string, error: unknown): WelcomeOpenProblem | undefined {
  const refusal =
    shellRefusalOf(error) ?? shellRefusalOf((error as { cause?: unknown } | null)?.cause);
  if (refusal?.kind === "profile_inside") {
    const fix = profileInsideFix(refusal.reason);
    return { folder, kind: "denied", reason: cantOpenWords.profileInside, fix };
  }
  if (refusal?.kind === "workspace_inside_profile") {
    const { insideProfile: reason, insideProfileFix: fix } = cantOpenWords;
    return { folder, kind: "denied", reason, fix, removeFromRecent: true };
  }
  return undefined;
}

/** The shell's place refusal, `{ kind, reason? }`, when `value` is one. */
function shellRefusalOf(value: unknown): { kind: string; reason?: string } | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { kind, reason } = value as { kind?: unknown; reason?: unknown };
  if (kind !== "profile_inside" && kind !== "workspace_inside_profile") return undefined;
  return typeof reason === "string" ? { kind, reason } : { kind };
}
