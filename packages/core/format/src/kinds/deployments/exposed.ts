import { type Infer, s } from "@halonicjs/schema-kit";
import { id } from "../../shared/fields.ts";

/** The most characters a name an end user reads (`name`, `label`) may have. */
const TITLE_MAX_LENGTH = 80;

/** The most characters a longer text an end user reads (`description`, `help`) may have. */
const TEXT_MAX_LENGTH = 500;

/** The most characters an approval text may have, before its `{arg}` places are filled. */
const APPROVAL_TEXT_MAX_LENGTH = 500;

/** The most characters a state, input or context key name may have. */
const KEY_MAX_LENGTH = 64;

/** Text an end user reads: at least one character and at most `max`. */
function shownText(max: number) {
  return s.string().min(1).max(max, `use at most ${max} characters`);
}

/** A name from the workflow's definition: a state, an input or a context key. */
const definitionName = s
  .string()
  .min(1)
  .max(KEY_MAX_LENGTH, `use at most ${KEY_MAX_LENGTH} characters`)
  .regex(/^[A-Za-z0-9_][A-Za-z0-9_-]*$/, "use letters, digits, '_' or '-'");

/** `<connector>/<tool>`: the connector's id and the tool's name, as the workflow's tool states name them. */
const toolName = s
  .string()
  .max(2 * KEY_MAX_LENGTH + 1)
  .regex(
    /^[a-z0-9][a-z0-9-_]*\/[A-Za-z0-9_][A-Za-z0-9_.-]*$/,
    "use '<connector>/<tool>', the connector's id and the tool's name",
  );

/** How an end user fills in one of the workflow's inputs. */
export const ExposedInput = s
  .object({
    /** The field's label. */
    label: shownText(TITLE_MAX_LENGTH),
    /** A line under the field that says what to put in it. */
    help: shownText(TEXT_MAX_LENGTH).optional(),
  })
  .strict();

/**
 * What an end user sees of a run. Each list shows only what it names: an
 * empty or missing list shows nothing, and there are no wildcards.
 */
export const ExposedShows = s
  .object({
    /** The states whose answers the end user reads. */
    answers: s.array(definitionName).default([]),
    /** The context keys shown as the run's results. */
    results: s.array(definitionName).default([]),
    /**
     * The text an end user approves a tool call by, per `<connector>/<tool>`.
     * `{arg}` places are filled with the call's arguments, and the filled
     * text is shown as plain text, never as markup.
     */
    approvals: s.record(toolName, shownText(APPROVAL_TEXT_MAX_LENGTH)).default({}),
  })
  .strict();

/**
 * One workflow an end user of a `mode: many` deployment may start, and what
 * they see of it (selling layer design, section 16.4). Everything an end
 * user can see is written here, in the deploy file, not in the workflow.
 */
export const ExposedWorkflow = s
  .object({
    /** The workflow's id in the workspace. */
    workflow: id,
    /** The name the end user sees. */
    name: shownText(TITLE_MAX_LENGTH),
    /** A line that says what the workflow does. */
    description: shownText(TEXT_MAX_LENGTH).optional(),
    /** `chat`: the end user talks to it. `form`: they fill in its inputs once. */
    kind: s.enum(["chat", "form"]),
    /** How the end user fills in each input, by the input's name. */
    inputs: s.record(definitionName, ExposedInput).default({}),
    /** What the end user sees of a run. */
    shows: ExposedShows.default({ answers: [], results: [], approvals: {} }),
  })
  .strict();

/** How an end user fills in one input. */
export type ExposedInput = Infer<typeof ExposedInput>;
/** What an end user sees of a run, with defaults filled in. */
export type ExposedShows = Infer<typeof ExposedShows>;
/** One workflow end users may start, with defaults filled in. */
export type ExposedWorkflow = Infer<typeof ExposedWorkflow>;
