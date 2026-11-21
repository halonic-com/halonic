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
 * back. Throws `not_found` for any other hub, so no stray folder is made, and `invalid_input` naming
 * the file and line when the Default hub's file is there but doesn't load, so it isn't overwritten.
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
 * The refusal of a Default hub file that doesn't load. It carries the file and the line as facts,
 * so a dialog words it for where it runs (a phone has no room for the path); the parser's own
 * sentence is only its cause, for the log (microcopy 1.4).
 */
class UnreadableDefaultHub extends KindedError {
  readonly file = defaultHubPath;
  readonly line: number;

  constructor(line: number, parserMessage: string) {
    super("invalid_input", `${defaultHubPath} can't be read right now (line ${line}).`, {
      fix: "Fix it in the file, then try again.",
      cause: new Error(parserMessage),
    });
    this.line = line;
  }
}

/**
 * Throws `invalid_input` for the first error of the Default hub's file, if it has one: a file that
 * fails to load is still the user's, and writing a fresh one over it would lose their text.
 */
function refuseBrokenDefaultHub(issues: readonly WorkspaceIssue[]): void {
  const error = issues.find((issue) => issue.file === defaultHubPath && issue.severity === "error");
  if (error === undefined) return;
  throw new UnreadableDefaultHub(error.line, error.message);
}
