import { type Infer, s } from "@halonicjs/schema-kit";
import { id, version } from "../../shared/fields.ts";

/*
 * A tool definition: what an agent sees of one tool (its name, short
 * description and parameters), who may call it, and which action runs it.
 * It holds only data. What a call can do is the action's, and actions are
 * code in Halonic, so a workspace can rename, reword and rearrange tools but
 * never give one a new power. The list of actions isn't known here: the
 * snapshot checks each `action` against the actions the runtime offers.
 */

/** A tool's name: lowercase letters, digits and `_`, starting with a letter, as `pr_status`. */
export const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

/** The most characters a tool's name may have; engines put a prefix in front of it. */
export const MAX_TOOL_NAME_LENGTH = 48;

/**
 * An action's name: dot-separated lowercase words, as `github.pull-request-status`.
 * Whether Halonic has the action is the snapshot's check.
 */
export const ACTION_NAME_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;

/** The most parameters a tool may have. */
export const MAX_TOOL_PARAMETERS = 20;

/** The most choices a string parameter may have. */
export const MAX_TOOL_CHOICES = 50;

/** The most characters a tool's or a parameter's description may have. */
export const MAX_TOOL_DESCRIPTION_LENGTH = 300;

/**
 * A character a person can't see: a control character (\p{Cc}), a format
 * character (\p{Cf}: zero-width spaces and joiners, the byte-order mark,
 * text-direction marks and the tag characters U+E0000–E007F), or a line or
 * paragraph separator (\p{Zl}, \p{Zp}). Agents read these texts and people
 * check them, so text one sees and the other doesn't, such as instructions
 * written in tag characters, is refused. The separators would also break a
 * description's one line.
 */
const HIDDEN_CHARACTER = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Bidi_Control}]/u;

/** The message for a text with a hidden character. */
const NO_HIDDEN_CHARACTERS =
  "write one line, without control, invisible or text-direction characters";

/** Text an agent reads, with no hidden character. */
function visibleText(maxLength: number) {
  return s
    .string()
    .min(1)
    .max(maxLength)
    .refine((text) => !HIDDEN_CHARACTER.test(text), NO_HIDDEN_CHARACTERS);
}

/** A short description, on one line, with no hidden mark. */
const description = visibleText(MAX_TOOL_DESCRIPTION_LENGTH);

/**
 * A parameter's name, as the agent writes it: `pr`, `repo`, `issueId`. A
 * name every object already has, such as `constructor` or `toString`, is
 * refused, so code that later asks whether a call's argument is a declared
 * parameter can't be fooled by the object's own members.
 */
const parameterName = s
  .string()
  .regex(/^[a-z][A-Za-z0-9_]*$/, "use letters, digits or '_', starting with a lowercase letter")
  .max(MAX_TOOL_NAME_LENGTH)
  .refine(
    (name) => !(name in Object.prototype),
    "use a name of your own: every object already has this one",
  );

/** One parameter of a tool. */
export const ToolParameter = s
  .object({
    type: s.enum(["string", "integer", "number", "boolean"]),
    description,
    /** Whether a call must give it. Left out: it may be left out of a call. */
    required: s.boolean().default(false),
    /** For a `string`: the only values a call may give. */
    choices: s.array(visibleText(100)).min(1).max(MAX_TOOL_CHOICES).optional(),
  })
  .strict();

/** A tool's parameter. */
export type ToolParameter = Infer<typeof ToolParameter>;

/**
 * Who may call the tool. Left out, nobody may: a tool is off until the file
 * says who it is for. `everyone` and `agents` don't go together; the kind's
 * check says so.
 */
export const ToolCallers = s
  .object({
    /** Every agent of the team may call it. */
    everyone: s.boolean().default(false),
    /** Only these agents, by id, may call it. */
    agents: s.array(id).max(200).default([]),
  })
  .strict();

/** Who may call a tool. */
export type ToolCallers = Infer<typeof ToolCallers>;

/**
 * A tool's fields, shared by the file and by the snapshot, which keeps
 * each tool without the file's `version`.
 */
export const toolFields = {
  /** The short name agents call the tool by. */
  name: s
    .string()
    .regex(
      TOOL_NAME_PATTERN,
      "use lowercase letters, digits or '_', starting with a letter, such as pr_status",
    )
    .max(MAX_TOOL_NAME_LENGTH),
  /** What the tool does, in a line agents read when they choose a tool. */
  description,
  /** The Halonic action that runs a call. */
  action: s
    .string()
    .regex(ACTION_NAME_PATTERN, "name an action, such as github.pull-request-status")
    .max(100),
  callers: ToolCallers.default({ everyone: false, agents: [] }),
  parameters: s.record(parameterName, ToolParameter).default({}),
};

/** A tool definition file. */
export const Tool = s.object({ version, ...toolFields }).strict();

/** A tool definition, with defaults filled in. */
export type Tool = Infer<typeof Tool>;

/** A tool as the snapshot keeps it: the file's fields without `version`. */
export type ToolEntry = Omit<Tool, "version">;
