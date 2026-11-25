import type { FileKind } from "../../kind.ts";
import { checkKeysIn } from "../../shared/key-in-value.ts";
import { MAX_TEMPLATE_FILE_BYTES, Template } from "./schema.ts";

/**
 * `library/templates/<id>.md`, at the workspace root only, like the tools
 * that serve them. A key pasted into a template would reach every agent
 * that reads it, so the title and text are checked for one.
 */
export const templateKind: FileKind<Template> = {
  name: "template",
  about: "A Markdown text agents read and fill in, such as a task description or a PR body.",
  syntax: "front-matter",
  schema: Template,
  places: [{ scope: "workspace", folder: "library/templates", name: "<id>.md" }],
  idFromPlace: "always",
  maxBytes: MAX_TEMPLATE_FILE_BYTES,
  check: (template) => [
    ...checkKeysIn(template.title, ["title"], "setting"),
    ...checkKeysIn(template.body, ["body"], "setting"),
  ],
};
