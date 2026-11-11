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
}

/** The reasons microcopy 3.2 and 22 F13 fix after "Can't open *folder*: ". */
export const cantOpenWords = {
  gone: "the folder is gone.",
  denied: "you don't have permission to read it.",
  unexplained: "Halonic ran into a problem it can't explain yet.",
} as const;

/**
 * The problem to show when a folder fails to open (`shell.welcome.cant-open`, states-flow-map D7):
 * a folder that isn't there is "gone", one the user can't read is "you don't have permission",
 * an error without a kind is the F13 sentence with its details for **Copy details**, and any
 * other kind says the engine's own message, which is safe to show.
 *
 * @example
 * cantOpenProblem("/work/old", new KindedError("not_found", "No such folder: /work/old"));
 * // { folder: "/work/old", reason: "the folder is gone.", kind: "not_found" }
 */
export function cantOpenProblem(folder: string, error: unknown): WelcomeOpenProblem {
  const kind = errorKindOf(error);
  switch (kind) {
    case "not_found":
      return { folder, kind, reason: cantOpenWords.gone };
    case "denied":
      return { folder, kind, reason: cantOpenWords.denied };
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
