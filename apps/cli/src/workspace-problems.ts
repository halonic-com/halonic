// A workspace whose files have errors (HAL-6613). `loadWorkspace` leaves
// each such file out, so what loads is not the workspace the user wrote: a
// provider file with a pasted key is missing, and the workspace can look as
// if it only reached the test model. No run starts there, and `doctor`
// shows it as a problem, until `halonic validate` finds no error.

import { KindedError } from "@halonicjs/std";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import type { Message } from "./messages/define.ts";
import { plainText } from "./messages/phrase.ts";
import { workspaceMessages } from "./messages/workspace.ts";
import { printable } from "./output/printable.ts";
import type { OpenWorkspaceDir } from "./workspace-dir.ts";
import { workspaceNameOf } from "./workspace-trust.ts";

/**
 * How many errors `halonic validate` finds in the workspace's files: the
 * problems that leave a file out. Warnings leave nothing out, so they don't count.
 */
export function fileProblemsOf(workspace: LoadedWorkspace): number {
  return workspace.issues.filter((issue) => issue.severity === "error").length;
}

/**
 * A run refused because the workspace's files have errors: `invalid_input`,
 * exit 2, as for any file the user gave that is wrong. The fix points at
 * `halonic validate`, which lists them; the problems themselves aren't
 * repeated here, so a pasted key in one never reaches this error.
 */
export class WorkspaceFileProblemsError extends KindedError {
  /** The detailed code on line 3 and in `--json`. */
  readonly code = "workspace-file-problems";

  constructor(workspace: string, count: number, nothingDone: Message, typedDir?: string) {
    super(
      "invalid_input",
      plainText(workspaceMessages.fileProblems(workspace, count, nothingDone.phrase).phrase),
      { fix: plainText(workspaceMessages.fileProblemsFix(typedDir).phrase) },
    );
  }
}

/**
 * Refuses to go on when the workspace's files have errors, before anything
 * starts: "✕ Couldn't run support-reply: Acme has 2 problems in its files.
 * Nothing ran." and "See them with: halonic validate".
 *
 * @param nothingDone - the end of line 1: "Nothing ran." or "Nothing was sent."
 * @param typedDir - the user's own `--dir`, for the suggested command
 * @throws WorkspaceFileProblemsError when `halonic validate` would find an error
 */
export function refuseFileProblems(
  dir: OpenWorkspaceDir,
  workspace: LoadedWorkspace,
  nothingDone: Message,
  typedDir: string | undefined,
): void {
  const count = fileProblemsOf(workspace);
  if (count === 0) return;
  const name = printable(workspaceNameOf(workspace, dir));
  throw new WorkspaceFileProblemsError(name, count, nothingDone, typedDir);
}
