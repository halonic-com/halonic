// `library/templates/<id>.md`: a text the workspace gives its agents to fill
// in, such as a task description with "Done when" or a pull request body
// (plan on HAL-17956, PR 2). It is read only: an agent reads a template
// through a tool, and nothing in it can change what an agent may do.
import { type Infer, s } from "@halonicjs/schema-kit";
import { id } from "../../shared/fields.ts";
import { label, NO_HIDDEN_MARKS, withoutHiddenMarks } from "../../shared/shown-text.ts";

/** The most characters a template's text may have. */
export const MAX_TEMPLATE_CHARS = 32_000;

/** The most bytes a template file may have; a larger one is refused before it is parsed. */
export const MAX_TEMPLATE_FILE_BYTES = 64 * 1024;

/** The longest template id, so a snapshot's list stays short to read. */
export const MAX_TEMPLATE_ID_LENGTH = 64;

/** Windows line breaks, read as plain `\n` so a file saved on Windows reads the same way. */
const windowsLineBreak = /\r\n/g;

/**
 * A template, as `library/templates/<id>.md` holds it: optional YAML front
 * matter with a `title`, then the Markdown text. Without front matter the
 * whole file is the text. The file name is the id. Other front matter keys
 * are dropped, as for a skill.
 */
export const Template = s.object({
  /** The file name without `.md`. */
  id: id.max(MAX_TEMPLATE_ID_LENGTH),
  /** A short title for lists; the id when it is left out. */
  title: label.optional(),
  /** The Markdown text the agent fills in, trimmed, with or without front matter. */
  body: s.preprocess(
    (text) => (typeof text === "string" ? text.replace(windowsLineBreak, "\n").trim() : text),
    s.string().min(1).max(MAX_TEMPLATE_CHARS).refine(withoutHiddenMarks, NO_HIDDEN_MARKS),
  ),
});

/** A workspace template: its id, optional title and Markdown text. */
export type Template = Infer<typeof Template>;
