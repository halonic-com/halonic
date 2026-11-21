import { errorReasonFor } from "@halonicjs/studio-shell";
import { defaultHubPath } from "@halonicjs/workspace";
import { newWorkflowWords as words } from "./new-workflow-words.ts";

/**
 * The reason after "Couldn't create the workflow:", without its full stop. The host refuses a Default
 * hub file that doesn't load with the file and the line as facts (`studio.first-hub-unloadable`),
 * and this words it for where the dialog runs: a phone has no room for the path (UX check C503,
 * M1). Any other failure gives its own reason.
 *
 * @example
 * setFailure(words.createFailed(createFailureReason(error, phone)));
 */
export function createFailureReason(error: unknown, phone: boolean): string {
  const line = unreadableDefaultHubLine(error);
  if (line === undefined) return errorReasonFor(error).replace(/\.$/, "");
  return phone
    ? words.defaultHubUnreadableOnPhone
    : words.defaultHubUnreadable(defaultHubPath, line);
}

/** The line a refusal of the Default hub's file names, or `undefined` for any other failure. */
function unreadableDefaultHubLine(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const { file, line } = error as { readonly file?: unknown; readonly line?: unknown };
  return file === defaultHubPath && typeof line === "number" ? line : undefined;
}
