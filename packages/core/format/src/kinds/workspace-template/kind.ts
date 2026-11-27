import type { FileKind } from "../../kind.ts";
import { checkKeysIn } from "../../shared/key-in-value.ts";
import { MAX_WORKSPACE_TEMPLATE_FILE_BYTES, WorkspaceTemplate } from "./schema.ts";

/** Where a workspace's template sits, relative to its root. */
export const workspaceTemplatePath = "template.yaml";

/**
 * `template.yaml` at a workspace's root. It has no place, so the workspace
 * loader never reads it and a template a reader can't parse never fails the
 * workspace: the commands that show it (`halonic serve`, `halonic init`)
 * read it on their own and skip it with a warning.
 */
export const workspaceTemplateKind: FileKind<WorkspaceTemplate> = {
  name: "workspaceTemplate",
  about: "How a shared workspace presents itself: its title, kind and the first things to try.",
  syntax: "yaml",
  schema: WorkspaceTemplate,
  places: [],
  idFromPlace: "none",
  maxBytes: MAX_WORKSPACE_TEMPLATE_FILE_BYTES,
  // A key pasted into a shared template would reach everyone who copies it.
  check: (template) => [
    ...checkKeysIn(template.summary, ["summary"], "setting"),
    ...template.tryFirst.flatMap((entry, index) =>
      checkKeysIn(entry.hint, ["tryFirst", index, "hint"], "setting"),
    ),
  ],
};
