// What a tool file is refused for beyond its schema. A tool definition
// decides what agents can do, so these checks are part of the trust root
// (plan HAL-17450 rev 5, "Safety"): the builder and the plugin's loader run
// them again on every snapshot.
import type { KindCheckProblem } from "../../kind.ts";
import { checkKeysIn, credentialName } from "../../shared/key-in-value.ts";
import { type ActionParameter, type ActionParameterShape, toolActionInfo } from "./actions.ts";
import type { Tool, ToolParameter } from "./schema.ts";

/*
 * The words wait on the board (HAL-2264, P8), like those in
 * `key-in-value.ts`.
 */
const words = {
  parameterAsksForKey:
    "A tool never takes a key from an agent. Rename the parameter, or use an action that reads its key from the plugin's settings.",
  emptyRange: "minimum is more than maximum, so no value fits. Swap them or widen the range.",
  parameterMissing: (action: string, name: string) =>
    `The action ${action} reads the parameter '${name}', so every tool that runs it must declare it. Add '${name}' under parameters, or rename the parameter that should be '${name}'.`,
  parameterNotRead: (action: string, names: readonly string[]) =>
    `The action ${action} never reads this parameter, so an agent's value for it would be dropped. ${
      names.length === 0
        ? "It reads no parameters: remove it."
        : `It reads only ${names.map((name) => `'${name}'`).join(", ")}: rename or remove it.`
    }`,
  parameterOptional: (action: string, name: string) =>
    `The action ${action} can't run without '${name}', so a call that leaves it out would fail. Set 'required: true' on '${name}'.`,
  parameterType: (action: string, name: string, expected: string, declareWith: string) =>
    `The action ${action} reads '${name}' as ${expected}. Declare it with ${declareWith}.`,
} as const;

/** A parameter, or one field of an object parameter, with its name and where it sits. */
interface Placed {
  readonly name: string;
  readonly parameter: ToolParameter;
  readonly path: (string | number)[];
}

/** Every parameter and every field of an object parameter, with where it sits. */
function allParameters(tool: Tool): Placed[] {
  return Object.entries(tool.parameters).flatMap(([name, parameter]) => {
    const path = ["parameters", name];
    const fields =
      parameter.type === "object"
        ? Object.entries(parameter.fields).map(([field, value]) => ({
            name: field,
            parameter: value,
            path: [...path, "fields", field],
          }))
        : [];
    return [{ name, parameter, path }, ...fields];
  });
}

/** A parameter's choices, its own or its list items', with where they sit. */
function choicesOf({ parameter, path }: Placed) {
  if (parameter.type === "string" && parameter.enum !== undefined) {
    return [{ value: parameter.enum, path: [...path, "enum"] }];
  }
  if (parameter.type === "list" && parameter.items.type === "string") {
    const { enum: choices } = parameter.items;
    return choices === undefined ? [] : [{ value: choices, path: [...path, "items", "enum"] }];
  }
  return [];
}

/**
 * Every text in a tool file an agent reads or an action uses, with where
 * it sits: the tool's id and name, the description, each parameter's and
 * field's name, description and choices, the named callers and the
 * action's settings. Names are checked too: an agent sees them as often as
 * the wording.
 */
function textsOf(tool: Tool): { readonly value: unknown; readonly path: (string | number)[] }[] {
  const parameters = allParameters(tool).flatMap((placed) => [
    { value: placed.name, path: placed.path },
    { value: placed.parameter.description, path: [...placed.path, "description"] },
    ...choicesOf(placed),
  ]);
  const callers =
    tool.callers === "everyone"
      ? []
      : [{ value: tool.callers.agents, path: ["callers", "agents"] }];
  return [
    { value: tool.id, path: ["id"] },
    { value: tool.name, path: ["name"] },
    { value: tool.description, path: ["description"] },
    ...parameters,
    ...callers,
    { value: tool.action["with"], path: ["action", "with"] },
  ];
}

/** A number value whose range holds no value. */
function rangeIsEmpty(value: {
  readonly minimum?: number | undefined;
  readonly maximum?: number | undefined;
}): boolean {
  const { minimum, maximum } = value;
  return minimum !== undefined && maximum !== undefined && minimum > maximum;
}

/** Where a parameter's or its list items' range holds no value, if anywhere. */
function emptyRangeAt({ parameter, path }: Placed): (string | number)[] | undefined {
  if ((parameter.type === "integer" || parameter.type === "number") && rangeIsEmpty(parameter)) {
    return [...path, "minimum"];
  }
  const items = parameter.type === "list" ? parameter.items : undefined;
  if ((items?.type === "integer" || items?.type === "number") && rangeIsEmpty(items)) {
    return [...path, "items", "minimum"];
  }
  return undefined;
}

/** A parameter's own refusals: a name that asks for a key, a range that holds nothing. */
function ownProblems(placed: Placed): KindCheckProblem[] {
  const range = emptyRangeAt(placed);
  return [
    ...(credentialName.test(placed.name)
      ? [
          {
            severity: "error" as const,
            code: "parameter-asks-for-key",
            path: placed.path,
            message: words.parameterAsksForKey,
          },
        ]
      : []),
    ...(range === undefined
      ? []
      : [
          {
            severity: "error" as const,
            code: "parameter-range-empty",
            path: range,
            message: words.emptyRange,
          },
        ]),
  ];
}

/** How an action reads a parameter, and the types that fit, as words for a message. */
function expectedWords(shape: ActionParameterShape | undefined) {
  if (shape === undefined) {
    return { expected: "a flat value", declareWith: "type string, integer, number or boolean" };
  }
  if (shape.type === "object") {
    return { expected: "an object (type object)", declareWith: "that type" };
  }
  const list = `a list of ${shape.items} (type list)`;
  return shape.orText === true
    ? { expected: `${list} or one text with commas (type string)`, declareWith: "either type" }
    : { expected: list, declareWith: "that type" };
}

/** Whether the declared parameter has the type the action reads it as. */
function typeMatches(declared: ToolParameter, shape: ActionParameterShape | undefined): boolean {
  if (shape === undefined) return declared.type !== "object" && declared.type !== "list";
  if (shape.type === "object") return declared.type === "object";
  if (shape.orText === true && declared.type === "string") return true;
  return declared.type === "list" && declared.items.type === shape.items;
}

/** What one tool file's parameters, or one object's fields, are checked against. */
interface Reading {
  readonly action: string;
  readonly reads: readonly ActionParameter[];
  readonly declared: Readonly<Record<string, ToolParameter>>;
  readonly path: (string | number)[];
  /** Put before a field's name in messages, such as `monitor.`. */
  readonly prefix: string;
}

/** One declared parameter against the way its action reads it: required, type, and an object's fields. */
function checkDeclared(reading: Reading, read: ActionParameter): KindCheckProblem[] {
  const declared = reading.declared[read.name];
  if (declared === undefined) return [];
  const path = [...reading.path, read.name];
  const name = `${reading.prefix}${read.name}`;
  const optional: KindCheckProblem[] =
    read.required && !declared.required
      ? [
          {
            severity: "error",
            code: "parameter-optional",
            path: [...path, "required"],
            message: words.parameterOptional(reading.action, name),
          },
        ]
      : [];
  if (!typeMatches(declared, read.shape)) {
    const { expected, declareWith } = expectedWords(read.shape);
    const message = words.parameterType(reading.action, name, expected, declareWith);
    return [
      ...optional,
      { severity: "error", code: "parameter-type", path: [...path, "type"], message },
    ];
  }
  const fields =
    declared.type === "object" && read.shape?.type === "object"
      ? checkReading({
          action: reading.action,
          reads: read.shape.fields,
          declared: declared.fields,
          path: [...path, "fields"],
          prefix: `${name}.`,
        })
      : [];
  return [...optional, ...fields];
}

/**
 * Declared parameters against the ones the action reads: each required one
 * must be declared and declared as required, each must have the type the
 * action reads it as, and no other may be declared. The messages name the
 * action's parameters, never the file's, which may hold a key.
 */
function checkReading(reading: Reading): KindCheckProblem[] {
  const { action, reads, path } = reading;
  const declaredNames = Object.keys(reading.declared);
  const missing = reads
    .filter((parameter) => parameter.required && !declaredNames.includes(parameter.name))
    .map(
      (parameter): KindCheckProblem => ({
        severity: "error",
        code: "parameter-missing",
        path,
        message: words.parameterMissing(action, `${reading.prefix}${parameter.name}`),
      }),
    );
  const readNames = reads.map((parameter) => parameter.name);
  const notRead = declaredNames
    .filter((name) => !readNames.includes(name))
    .map(
      (name): KindCheckProblem => ({
        severity: "error",
        code: "parameter-not-read",
        path: [...path, name],
        message: words.parameterNotRead(
          action,
          readNames.map((one) => `${reading.prefix}${one}`),
        ),
      }),
    );
  return [...missing, ...notRead, ...reads.flatMap((read) => checkDeclared(reading, read))];
}

/**
 * Checks a tool that passed its schema:
 *
 * - `value-looks-like-key` for a key written into any of its texts
 *   (`format.keys-in-values`); the message never repeats it.
 * - `parameter-asks-for-key` for a parameter or field whose name says it
 *   holds a credential, such as `token` or `apiKey`: an agent would have
 *   to hold the key to pass it.
 * - `parameter-range-empty` for a number parameter, field or list item
 *   whose `minimum` is more than its `maximum`.
 * - `parameter-missing` for a parameter the action needs that the tool
 *   doesn't declare, `parameter-optional` for one it declares without
 *   `required: true`, `parameter-type` for one declared with another type
 *   than the action reads it as, and `parameter-not-read` for one it
 *   declares that the action never reads (`ToolActionInfo.parameters`); an
 *   object's fields are checked the same way. Either way every call would
 *   fail or lose a value.
 *
 * @param tool - the parsed tool file
 * @returns every problem, all errors
 */
export function checkTool(tool: Tool): KindCheckProblem[] {
  const keys = textsOf(tool).flatMap(({ value, path }) => checkKeysIn(value, path, "setting"));
  const own = allParameters(tool).flatMap(ownProblems);
  const action = tool.action.run;
  const reading = checkReading({
    action,
    reads: toolActionInfo(action).parameters,
    declared: tool.parameters,
    path: ["parameters"],
    prefix: "",
  });
  return [...keys, ...own, ...reading];
}
