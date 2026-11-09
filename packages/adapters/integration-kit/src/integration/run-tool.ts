import type { IntegrationTool } from "@halonicjs/ports";
import type { ErrorKind } from "@halonicjs/std/error-kind";

/** One problem in a tool's arguments: where it is, never what the value was. */
export interface ArgumentIssue {
  readonly path: readonly PropertyKey[];
}

/** What checking a tool's arguments gives: the parsed arguments, or what is wrong with them. */
export type ArgumentCheck<Output> =
  | { readonly success: true; readonly data: Output }
  | { readonly success: false; readonly error: { readonly issues: readonly ArgumentIssue[] } };

/**
 * The part of a Zod schema that {@link runTool} uses. Every Zod schema has
 * it, so a tool passes its `z.strictObject(...)` as it is. The kit itself
 * doesn't import Zod, so this entry brings in no outside code.
 */
export interface ArgumentSchema<Output = unknown> {
  safeParse(input: unknown): ArgumentCheck<Output>;
}

/** The arguments a schema gives after parsing: `z.infer<Schema>` for a Zod schema. */
export type ArgumentsOf<Schema extends ArgumentSchema> =
  Schema extends ArgumentSchema<infer Output> ? Output : never;

/**
 * What a tool's `run` gives: a small value that becomes the call's JSON
 * result. A tool that only changes something still says what happened,
 * for example `{ deleted: true }`, so the model never gets an empty answer.
 * `object` and not a JSON type, so a tool can return its own interfaces.
 */
export type ToolResult = object | string | number | boolean | null;

/**
 * One tool: what the model sees, how its arguments are checked, and what runs.
 *
 * @example
 * export const searchTool = {
 *   declaration: { name: "gmail_search", description: "…", parameters: z.toJSONSchema(searchArguments, { io: "input" }), risk: "read", untrusted: true },
 *   arguments: searchArguments,
 *   async run(client, args, signal) { return await client.search(args.query, signal); },
 * } satisfies ToolImplementation<GmailClient, typeof searchArguments>;
 */
export interface ToolImplementation<Client, Arguments extends ArgumentSchema = ArgumentSchema> {
  readonly declaration: IntegrationTool;
  readonly arguments: Arguments;
  // Method syntax on purpose: it lets a list hold tools with different arguments.
  run(client: Client, args: ArgumentsOf<Arguments>, signal?: AbortSignal): Promise<ToolResult>;
}

/** Why {@link runTool} refused a call. */
export type ToolCallRefusal = "bad-arguments" | "not-found";

/** How a surface should respond to each {@link ToolCallRefusal}. */
const toolCallRefusalKinds: Readonly<Record<ToolCallRefusal, ErrorKind>> = {
  "bad-arguments": "invalid_input",
  "not-found": "not_found",
};

/**
 * Builds the integration's own error for a refused call (the integrations
 * guide, section 7). `kind` is how a surface should respond; an error that
 * keeps it as its `kind` property is reported that way, and anything else
 * as an internal error.
 */
export type MakeError = (code: ToolCallRefusal, message: string, kind: ErrorKind) => Error;

/** One tool call as the connection receives it. */
export interface RunToolCall {
  readonly name: string;
  readonly args: Record<string, unknown>;
  readonly signal?: AbortSignal | undefined;
}

/** A tool or field name the model made up is repeated only this far. */
const maxEchoedNameLength = 64;

/**
 * Finds the tool, checks its arguments and runs it. The result is the
 * tool's own small object as JSON, never the service's raw response.
 *
 * @example
 * callTool: (name, args, signal) => runTool(tools, client, { name, args, signal }, gmailError),
 *
 * @throws `makeError("not-found", …, "not_found")` for a tool that isn't in
 *   `tools`, and `makeError("bad-arguments", …, "invalid_input")` naming each
 *   bad field, never its value
 */
export async function runTool<Client>(
  tools: readonly ToolImplementation<Client>[],
  client: Client,
  call: RunToolCall,
  makeError: MakeError,
): Promise<string> {
  const tool = tools.find((candidate) => candidate.declaration.name === call.name);
  if (tool === undefined) {
    throw refusal("not-found", `There is no tool named ${shortened(call.name)}.`, makeError);
  }
  const parsed = tool.arguments.safeParse(call.args);
  if (!parsed.success) {
    // Name the bad fields, never their values: they may hold the user's content.
    const fields = parsed.error.issues.map(fieldName);
    const message = `Check these arguments: ${[...new Set(fields)].join(", ")}.`;
    throw refusal("bad-arguments", message, makeError);
  }
  const result = await tool.run(client, parsed.data, call.signal);
  // The type rules out nothing, but plain JavaScript can still give it, and
  // JSON.stringify(undefined) isn't a string.
  return JSON.stringify(result ?? null);
}

function refusal(code: ToolCallRefusal, message: string, makeError: MakeError): Error {
  return makeError(code, message, toolCallRefusalKinds[code]);
}

/**
 * `maxResults`, `to.0`, or `(arguments)` for a problem with the whole object.
 * Shortened, because a key of a `z.record(...)` is whatever the model made up.
 */
function fieldName(issue: ArgumentIssue): string {
  // String() and not join(): a path may hold a symbol, which join() can't convert.
  return shortened(issue.path.map((part) => String(part)).join(".")) || "(arguments)";
}

function shortened(name: string): string {
  return name.slice(0, maxEchoedNameLength);
}
