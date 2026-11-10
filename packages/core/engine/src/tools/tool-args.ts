// Reads the arguments a model gave one of Halonic's tools. The model writes
// them, so nothing is taken on trust: a value of the wrong kind throws, and
// the turn hands the error back to the model as the call's result.

/** The arguments of one tool call, as the model sent them. */
export type ToolArgs = Readonly<Record<string, unknown>>;

/**
 * A whole number between `min` and `max`, or `fallback` when the model left it out.
 *
 * @throws Error naming the argument when it is there but isn't such a number
 */
export function integerArg(
  args: ToolArgs,
  name: string,
  limits: { readonly min: number; readonly max: number; readonly fallback: number },
): number {
  const value = args[name];
  if (value === undefined || value === null) {
    return limits.fallback;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`"${name}" must be a whole number (got ${JSON.stringify(value)})`);
  }
  if (value < limits.min || value > limits.max) {
    throw new Error(`"${name}" must be from ${limits.min} to ${limits.max} (got ${value})`);
  }
  return value;
}

/**
 * A string, or `undefined` when the model left it out or sent an empty one.
 *
 * @throws Error naming the argument when it is there but isn't a string
 */
export function optionalStringArg(args: ToolArgs, name: string): string | undefined {
  const value = args[name];
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`"${name}" must be a string (got ${JSON.stringify(value)})`);
  }
  return value;
}

/**
 * A string that isn't empty.
 *
 * @throws Error naming the argument when it is missing, empty or not a string
 */
export function requiredStringArg(args: ToolArgs, name: string): string {
  const value = optionalStringArg(args, name);
  if (value === undefined) {
    throw new Error(`"${name}" is required`);
  }
  return value;
}

/**
 * One of the allowed strings, or `undefined` when the model left it out.
 *
 * @throws Error listing the allowed values when it is any other value
 */
export function choiceArg<Choice extends string>(
  args: ToolArgs,
  name: string,
  choices: readonly Choice[],
): Choice | undefined {
  const value = optionalStringArg(args, name);
  if (value === undefined) {
    return undefined;
  }
  const choice = choices.find((allowed) => allowed === value);
  if (choice === undefined) {
    throw new Error(
      `"${name}" must be one of ${choices.join(", ")} (got ${JSON.stringify(value)})`,
    );
  }
  return choice;
}

/** A value as short text: strings as they are, anything else as JSON, cut at `max` characters. */
export function shortText(value: unknown, max: number): string {
  const text = typeof value === "string" ? value : (JSON.stringify(value) ?? String(value));
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
