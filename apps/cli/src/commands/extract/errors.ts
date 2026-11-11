import { KindedError } from "@halonicjs/std";
import { OwnLineError } from "../../command.ts";
import { extractMessages } from "../../messages/extract.ts";
import { plainText } from "../../messages/phrase.ts";
import { nearMatch } from "../../near-match.ts";
import { printable } from "../../output/printable.ts";

/**
 * There's no such hub: `not_found`, so exit 4, on a line of its own:
 * "There's no hub called "famly" in home. Did you mean family?", then the
 * hubs there are. A workspace with files at the root only has no hub to
 * move out.
 *
 * @param hub - the hub as the user typed it
 * @param hubs - the workspace's hubs, sorted
 * @param workspace - the workspace folder's name, ready to print
 */
export function noHubError(hub: string, hubs: readonly string[], workspace: string): OwnLineError {
  if (hubs.length === 0) {
    return new OwnLineError(
      "not_found",
      extractMessages.noHubs(workspace),
      extractMessages.noHubsFix(),
    );
  }
  const shown = printable(hub);
  const near = nearMatch(hub, hubs);
  const line =
    near === undefined
      ? extractMessages.unknownHub(shown, workspace)
      : extractMessages.unknownHubNear(shown, workspace, near);
  return new OwnLineError("not_found", line, extractMessages.hubs(hubs));
}

/**
 * The workspace has errors: `conflict`, so exit 5, because its state doesn't
 * allow a copy now. A plan built from broken files would copy a broken hub,
 * or miss what a file that didn't load names.
 */
export class WorkspaceHasErrorsError extends KindedError {
  /** The detailed code on line 3 and in `--json`. */
  readonly code = "workspace-has-errors";

  constructor(errors: number) {
    super("conflict", plainText(extractMessages.hasErrors(errors).phrase), {
      fix: plainText(extractMessages.hasErrorsFix().phrase),
    });
  }
}

/**
 * The new folder already has files in it: `conflict`, so exit 5, with the
 * code `init` gives for the same reason. Nothing is written.
 */
export class ExtractFolderNotEmptyError extends KindedError {
  /** The detailed code on line 3 and in `--json`. */
  readonly code = "folder-not-empty";

  constructor() {
    super("conflict", plainText(extractMessages.notEmpty().phrase), {
      fix: plainText(extractMessages.notEmptyFix().phrase),
    });
  }
}
