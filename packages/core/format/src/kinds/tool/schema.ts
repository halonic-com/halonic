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

/** The most characters a tool's or a parameter's description may have. */
export const MAX_TOOL_DESCRIPTION_LENGTH = 300;

/**
 * A control character, or a mark that turns the direction of the text
 * around it. Agents and the people checking a tool read these texts, and
 * either can hide words or make one name look like another.
 */
const HIDDEN_MARK = /[\p{Cc}\p{Bidi_Control}]/u;

/** A short description, on one line, with no hidden mark. */
const description = s
  .string()
  .min(1)
  .max(MAX_TOOL_DESCRIPTION_LENGTH)
  .refine(
    (text) => !HIDDEN_MARK.test(text),
    "write one line, without control characters or text-direction marks",
  );

/** A parameter's name, as the agent writes it: `pr`, `repo`, `issueId`. */
const parameterName = s
  .string()
  .regex(/^[a-z][A-Za-z0-9_]*$/, "use letters, digits or '_', starting with a lowercase letter")
  .max(MAX_TOOL_NAME_LENGTH);

/** One parameter of a tool. */
export const ToolParameter = s
  .object({
    type: s.enum(["string", "integer", "number", "boolean"]),
    description,
    /** Whether a call must give it. Left out: it may be left out of a call. */
    required: s.boolean().default(false),
    /** For a `string`: the only values a call may give. */
    choices: s.array(s.string().min(1).max(100)).min(1).max(50).optional(),
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
