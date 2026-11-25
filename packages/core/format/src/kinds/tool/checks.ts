// What a tool file is refused for beyond its schema. A tool definition
// decides what agents can do, so these checks are part of the trust root
// (plan HAL-17450 rev 5, "Safety"): the builder and the plugin's loader run
// them again on every snapshot.
import type { KindCheckProblem } from "../../kind.ts";
import { checkKeysIn, credentialName } from "../../shared/key-in-value.ts";
import type { Tool, ToolParameter } from "./schema.ts";

/*
 * The words wait on the board (HAL-2264, P8), like those in
 * `key-in-value.ts`.
 */
const words = {
  parameterAsksForKey:
    "A tool never takes a key from an agent. Rename the parameter, or use an action that reads its key from the plugin's settings.",
  emptyRange: "minimum is more than maximum, so no value fits. Swap them or widen the range.",
} as const;

/**
 * Every text in a tool file an agent reads or an action uses, with where
 * it sits: the tool's id and name, the description, each parameter's name,
 * description and choices, the named callers and the action's settings.
 * Names are checked too: an agent sees them as often as the wording.
 */
function textsOf(tool: Tool): { readonly value: unknown; readonly path: (string | number)[] }[] {
  const parameters = Object.entries(tool.parameters).flatMap(([name, parameter]) => [
    { value: name, path: ["parameters", name] },
    { value: parameter.description, path: ["parameters", name, "description"] },
    ...(parameter.type === "string" && parameter.enum !== undefined
      ? [{ value: parameter.enum, path: ["parameters", name, "enum"] }]
      : []),
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

/** A number parameter whose range holds no value. */
function rangeIsEmpty(parameter: ToolParameter): boolean {
  if (parameter.type !== "integer" && parameter.type !== "number") {
    return false;
  }
  const { minimum, maximum } = parameter;
  return minimum !== undefined && maximum !== undefined && minimum > maximum;
}

/**
 * Checks a tool that passed its schema:
 *
 * - `value-looks-like-key` for a key written into any of its texts
 *   (`format.keys-in-values`); the message never repeats it.
 * - `parameter-asks-for-key` for a parameter whose name says it holds a
 *   credential, such as `token` or `apiKey`: an agent would have to hold
 *   the key to pass it.
 * - `parameter-range-empty` for a number parameter whose `minimum` is more
 *   than its `maximum`.
 *
 * @param tool - the parsed tool file
 * @returns every problem, all errors
 */
export function checkTool(tool: Tool): KindCheckProblem[] {
  const keys = textsOf(tool).flatMap(({ value, path }) => checkKeysIn(value, path, "setting"));
  const parameters = Object.entries(tool.parameters).flatMap(
    ([name, parameter]): KindCheckProblem[] => [
      ...(credentialName.test(name)
        ? [
            {
              severity: "error" as const,
              code: "parameter-asks-for-key",
              path: ["parameters", name],
              message: words.parameterAsksForKey,
            },
          ]
        : []),
      ...(rangeIsEmpty(parameter)
        ? [
            {
              severity: "error" as const,
              code: "parameter-range-empty",
              path: ["parameters", name, "minimum"],
              message: words.emptyRange,
            },
          ]
        : []),
    ],
  );
  return [...keys, ...parameters];
}
