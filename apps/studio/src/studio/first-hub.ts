import { KindedError } from "@halonicjs/std";
import {
  defaultHub,
  defaultHubPath,
  defaultHubText,
  type WorkspaceIssue,
} from "@halonicjs/workspace";

/**
 * The hub files a new agent or workflow in `hubId` writes along with its own file: none when the
 * workspace has that hub, and the Default hub's `hub.yaml` when the workspace has no hub at all and
 * `hubId` is the Default hub (`studio.first-hub`). Written in the same change, one undo takes both
 * back. Throws `not_found` for any other hub, so no stray folder is made, and `invalid_input` with
 * the load error when the Default hub's file is there but doesn't load, so it isn't overwritten.
 *
 * @example
 * files.change(label, { ...hubFilesFor(workspace.issues, hubs, hubId), [path]: text });
 */
export function hubFilesFor(
  issues: readonly WorkspaceIssue[],
  hubs: readonly { readonly id: string }[],
  hubId: string,
): Record<string, string> {
  if (hubs.some((hub) => hub.id === hubId)) return {};
  if (hubs.length === 0 && hubId === defaultHub.id) {
    refuseBrokenDefaultHub(issues);
    return { [defaultHubPath]: defaultHubText() };
  }
  throw new KindedError("not_found", `The workspace has no hub "${hubId}".`);
}

/**
 * Throws `invalid_input` with the first error of the Default hub's file, if it has one: a file that
 * fails to load is still the user's, and writing a fresh one over it would lose their text.
 */
function refuseBrokenDefaultHub(issues: readonly WorkspaceIssue[]): void {
  const error = issues.find((issue) => issue.file === defaultHubPath && issue.severity === "error");
  if (error === undefined) return;
  throw new KindedError(
    "invalid_input",
    `${defaultHubPath} doesn't load: ${error.message.replace(/\.$/, "")} (line ${error.line}).`,
  );
}
