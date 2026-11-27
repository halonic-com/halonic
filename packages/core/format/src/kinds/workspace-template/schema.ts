// `template.yaml` at a workspace's root: how a shared workspace presents
// itself, such as the Acme demo (design on HAL-19432). Everything in it is a
// claim anyone can write, so it may only change what is shown: nothing
// resets, deletes, runs or trusts anything because of it.
import { type Infer, s } from "@halonicjs/schema-kit";
import { id, version } from "../../shared/fields.ts";
import { relativePathProblem } from "../../shared/relative-path.ts";
import { HIDDEN_MARK, label, NO_HIDDEN_MARKS } from "../../shared/shown-text.ts";

/** The most characters a template's summary or hint may have. */
export const MAX_TEMPLATE_TEXT_CHARS = 200;

/** The most first things to try one template lists. */
export const MAX_TRY_FIRST = 10;

/** The most bytes a `template.yaml` may have; a larger one is refused before it is parsed. */
export const MAX_WORKSPACE_TEMPLATE_FILE_BYTES = 16 * 1024;

/**
 * A template's id: `publisher/name`, each part a lower-case {@link id}, such
 * as `halonic/acme-demo`. Only a claim: no one checks the publisher.
 */
export const templateId = s
  .string()
  .regex(
    /^[a-z0-9][a-z0-9-_]*\/[a-z0-9][a-z0-9-_]*$/,
    "use publisher/name, each in lowercase letters, digits, '-' or '_', starting with a letter or digit",
  )
  .max(129);

/** Plain text a person reads in one line, such as a hint. Never Markdown or HTML. */
const shownLine = s
  .string()
  .min(1)
  .max(MAX_TEMPLATE_TEXT_CHARS)
  .refine((text) => !HIDDEN_MARK.test(text), NO_HIDDEN_MARKS);

/** A path to a file inside the workspace, never absolute or with `..`. */
const workspacePath = s.string().superRefine((path, context) => {
  const problem = relativePathProblem(path, { root: "the workspace", part: "file or folder name" });
  if (problem !== null) context.addIssue({ code: "custom", message: problem });
});

/** One first thing to try: a workflow, the input file it starts with, and the hint shown for it. */
export const TryFirst = s
  .object({
    /** The workflow's id. */
    workflow: id,
    /** The input file, relative to the workspace. */
    input: workspacePath.optional(),
    /** One line of plain text, such as "Run the Support reply workflow in Studio." */
    hint: shownLine,
  })
  .strict();

/** `template.yaml`: a shared workspace's id, title, summary, kind and first things to try. */
export const WorkspaceTemplate = s
  .object({
    version,
    id: templateId,
    title: label,
    summary: shownLine,
    /** `demo`: a sample with invented data. `starter`: a base to build your own on. */
    kind: s.enum(["demo", "starter"]),
    tryFirst: s.array(TryFirst).max(MAX_TRY_FIRST).default([]),
  })
  .strict();

/** One first thing to try in a template. */
export type TryFirst = Infer<typeof TryFirst>;

/** A workspace's `template.yaml`, with defaults filled in. */
export type WorkspaceTemplate = Infer<typeof WorkspaceTemplate>;
