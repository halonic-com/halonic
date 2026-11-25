// `library/tools/<id>.tool.yaml`: one tool the workspace offers its agents
// through a plugin the builder makes (plan HAL-17450 rev 5). The file is
// data only: a name, wording, parameters, who may call it, and one action
// from `TOOL_ACTIONS` with its settings. Nothing here is specific to one
// engine or to Paperclip.
import { type Infer, s } from "@halonicjs/schema-kit";
import { id, version } from "../../shared/fields.ts";
import { label, NO_HIDDEN_MARKS, withoutHiddenMarks } from "../../shared/shown-text.ts";
import { TOOL_ACTIONS, type ToolActionName } from "./actions.ts";

/** The most parameters one tool takes. */
export const MAX_TOOL_PARAMETERS = 16;

/**
 * The name agents call the tool by, such as `pr_status`: lowercase words
 * joined by `_`, as most model providers require for a tool name.
 */
export const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]{0,47}$/;

/** A parameter's name, such as `pr` or `repoName`. */
export const PARAMETER_NAME_PATTERN = /^[a-z][A-Za-z0-9_]{0,39}$/;

/** The most bytes a tool file may have; a larger one is refused before it is parsed. */
export const MAX_TOOL_FILE_BYTES = 64 * 1024;

/**
 * A parameter's name, as the agent writes it. A name every object already
 * has, such as `constructor` or `toString`, is refused, so code that asks
 * whether a call's argument is a declared parameter can't be fooled by the
 * object's own members.
 */
const parameterName = s
  .string()
  .regex(PARAMETER_NAME_PATTERN, "start with a lowercase letter, such as 'pr' or 'repoName'")
  .refine(
    (name) => !(name in Object.prototype),
    "use a name of your own: every object already has this one",
  );

/** Text an agent reads to decide how to call the tool. It may break lines. */
function shownText(most: number) {
  return s.string().min(1).max(most).refine(withoutHiddenMarks, NO_HIDDEN_MARKS);
}

/** What every parameter has, whatever its type. */
const parameterBase = {
  description: shownText(300),
  /** Whether the agent must give it. A parameter is optional unless it says so. */
  required: s.boolean().default(false),
};

/** The keys of a text value: the only values the agent may give, and how long it may be. */
const textKeys = {
  type: s.literal("string"),
  /** The only values the agent may give. */
  enum: s.array(label).min(1).max(50).optional(),
  maxLength: s.number().int().min(1).max(10_000).default(1_000),
};

/** The keys of a whole number. */
const integerKeys = {
  type: s.literal("integer"),
  minimum: s.number().int().optional(),
  maximum: s.number().int().optional(),
};

/** The keys of any number. */
const numberKeys = {
  type: s.literal("number"),
  minimum: s.number().optional(),
  maximum: s.number().optional(),
};

/** The keys of a yes or no. */
const booleanKeys = { type: s.literal("boolean") };

/** One flat parameter: a text, a number or a yes or no. Also an object's field. */
const FlatParameter = s.discriminatedUnion("type", [
  s.object({ ...textKeys, ...parameterBase }).strict(),
  s.object({ ...integerKeys, ...parameterBase }).strict(),
  s.object({ ...numberKeys, ...parameterBase }).strict(),
  s.object({ ...booleanKeys, ...parameterBase }).strict(),
]);

/** What a list holds: one flat value, without a description of its own. */
const ListItem = s.discriminatedUnion("type", [
  s.object(textKeys).strict(),
  s.object(integerKeys).strict(),
  s.object(numberKeys).strict(),
  s.object(booleanKeys).strict(),
]);

/**
 * One parameter of a tool: a flat value, an object whose fields are flat
 * values, or a list of flat values. Nothing nests deeper, so an agent's
 * call stays easy to read and to check.
 */
export const ToolParameter = s.discriminatedUnion("type", [
  ...FlatParameter.options,
  s
    .object({
      type: s.literal("object"),
      ...parameterBase,
      /** The object's fields, each with its own description and `required`. */
      fields: s
        .record(parameterName, FlatParameter)
        .refine((fields) => Object.keys(fields).length >= 1, "give the object at least one field")
        .refine(
          (fields) => Object.keys(fields).length <= MAX_TOOL_PARAMETERS,
          `use at most ${MAX_TOOL_PARAMETERS} fields`,
        ),
    })
    .strict(),
  s
    .object({
      type: s.literal("list"),
      ...parameterBase,
      /** What each item of the list is. */
      items: ListItem,
      /** The most items the agent may give. */
      maxItems: s.number().int().min(1).max(100).default(20),
    })
    .strict(),
]);

/**
 * Who may call the tool: `everyone`, or the agents named. There is no
 * default, so a file that leaves it out offers the tool to no one: it fails.
 */
export const ToolCallers = s.union([
  s.literal("everyone"),
  s.object({ agents: s.array(label).min(1).max(100) }).strict(),
]);

/** `action` for one action name: `run` names it, `with` holds its settings. */
function actionChoice<Name extends ToolActionName>(name: Name) {
  return s
    .object({
      run: s.literal(name),
      with: TOOL_ACTIONS[name].settings,
    })
    .strict();
}

/** Which action runs the tool, and its settings. An unknown action is refused. */
export const ToolActionChoice = s.discriminatedUnion("run", [
  actionChoice("github.pull-request"),
  actionChoice("github.open-pull-requests"),
  actionChoice("github.merge-queue"),
  actionChoice("github.merge-times"),
  actionChoice("paperclip.task"),
  actionChoice("paperclip.failed-runs"),
  actionChoice("paperclip.budgets"),
  actionChoice("paperclip.template"),
  actionChoice("paperclip.comment"),
  actionChoice("paperclip.next-step"),
  actionChoice("paperclip.finish-run"),
]);

/** A workspace tool, as `library/tools/<id>.tool.yaml` holds it. */
export const Tool = s
  .object({
    version,
    id,
    name: s
      .string()
      .regex(TOOL_NAME_PATTERN, "use lowercase words joined by '_', such as 'pr_status'"),
    /** The short description the agent sees with the tool. Longer guidance belongs in a skill. */
    description: shownText(500),
    parameters: s
      .record(parameterName, ToolParameter)
      .refine(
        (parameters) => Object.keys(parameters).length <= MAX_TOOL_PARAMETERS,
        `use at most ${MAX_TOOL_PARAMETERS} parameters`,
      )
      .default({}),
    callers: ToolCallers,
    action: ToolActionChoice,
  })
  .strict();

/** A workspace tool, with defaults filled in. */
export type Tool = Infer<typeof Tool>;
/** One parameter of a workspace tool. */
export type ToolParameter = Infer<typeof ToolParameter>;
/** Who may call a workspace tool. */
export type ToolCallers = Infer<typeof ToolCallers>;
