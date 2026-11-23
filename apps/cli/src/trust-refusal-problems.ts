// What `halonic validate` adds for a connector or provider file that the trust
// check refuses, such as one whose address has a user name or password in it
// (HAL-16276, C692). The file itself is fine, so the loader passes it, and
// `validate` said "No problems" until `halonic trust`, `routines` or `run`
// refused it. The check is trust's own, so both always agree.

import type { Path } from "@halonicjs/schema-kit";
import {
  filesOf,
  type LoadedFileOf,
  type LoadedWorkspace,
  type RefusedItem,
  trustContent,
  type WorkspaceIssue,
} from "@halonicjs/workspace";
import { plainText } from "./messages/phrase.ts";
import { validateMessages } from "./messages/validate.ts";

/** The code of the error, in `validate`'s line and its `--json`. */
export const trustRefusedCode = "trust-refused";

/**
 * One error per connector or provider file whose content trust refuses, on
 * the key that holds the address, with trust's reason and never the address.
 *
 * @example
 * trustRefusalProblems(workspace);
 * // [{ file: "providers/gw.yaml", severity: "error", code: "trust-refused", … }]
 */
export function trustRefusalProblems(workspace: LoadedWorkspace): WorkspaceIssue[] {
  return [
    ...filesOf(workspace, "connector").flatMap((file) =>
      refusalsOf(file, ["transport", "http", "url"], trustContent({ connectors: [file.value] })),
    ),
    ...filesOf(workspace, "provider").flatMap((file) =>
      refusalsOf(file, ["baseUrl"], trustContent({ connectors: [], providers: [file.value] })),
    ),
  ];
}

function refusalsOf(
  file: LoadedFileOf<"connector" | "provider">,
  path: Path,
  content: { readonly refused?: readonly RefusedItem[] },
): WorkspaceIssue[] {
  return (content.refused ?? []).map(({ reason }) => ({
    file: file.path,
    severity: "error",
    source: "check",
    code: trustRefusedCode,
    path,
    line: 1,
    col: 1,
    message: plainText(validateMessages.trustRefused(reason).phrase),
  }));
}
