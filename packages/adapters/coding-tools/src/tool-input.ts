// Reading a tool call's arguments. The model writes them, so each one is
// checked here, and a wrong one gets an answer that says how to fix it.

/**
 * A tool call the tool refuses or can't do, such as a path outside the
 * working folder. Its message is the answer the model reads, as an error
 * result, so it says what to do instead and never holds a secret.
 */
export class ToolRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolRefusal";
  }
}

/** A tool call's arguments, as the MCP server hands them over. */
export type ToolArguments = Readonly<Record<string, unknown>>;

/**
 * Refuses an argument the tool doesn't take, so a misspelt limit isn't
 * quietly ignored.
 *
 * @throws {ToolRefusal} naming the first unknown argument
 */
export function refuseUnknownArguments(args: ToolArguments, known: readonly string[]): void {
  const unknown = Object.keys(args).find((name) => !known.includes(name));
  if (unknown !== undefined) {
    throw new ToolRefusal(`Unknown argument '${unknown}'. This tool takes: ${known.join(", ")}.`);
  }
}

/**
 * A text argument, or `undefined` when the call leaves it out.
 *
 * @throws {ToolRefusal} when it isn't text, is empty or is longer than `maxLength`
 */
export function optionalText(
  args: ToolArguments,
  name: string,
  maxLength: number,
): string | undefined {
  const value = args[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value === "") {
    throw new ToolRefusal(`'${name}' must be non-empty text.`);
  }
  if (value.length > maxLength) {
    throw new ToolRefusal(`'${name}' is longer than ${maxLength} characters.`);
  }
  return value;
}

/** A text argument the call must give. @throws {ToolRefusal} as {@link optionalText} does, or when it is missing */
export function requiredText(args: ToolArguments, name: string, maxLength: number): string {
  const value = optionalText(args, name, maxLength);
  if (value === undefined) throw new ToolRefusal(`'${name}' is missing.`);
  return value;
}

/**
 * A whole-number argument between `min` and `max`, or `undefined` when the
 * call leaves it out.
 *
 * @throws {ToolRefusal} when it isn't a whole number in that range
 */
export function optionalInteger(
  args: ToolArguments,
  name: string,
  { min, max }: { readonly min: number; readonly max: number },
): number | undefined {
  const value = args[name];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new ToolRefusal(`'${name}' must be a whole number from ${min} to ${max}.`);
  }
  return value;
}

/** A yes-or-no argument, `false` when left out. @throws {ToolRefusal} when it isn't `true` or `false` */
export function optionalFlag(args: ToolArguments, name: string): boolean {
  const value = args[name] ?? false;
  if (typeof value !== "boolean") throw new ToolRefusal(`'${name}' must be true or false.`);
  return value;
}
