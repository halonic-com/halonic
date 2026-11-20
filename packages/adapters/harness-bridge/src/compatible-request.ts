import { isPlainObject, KindedError } from "@halonicjs/std";

/**
 * What the bridge knows of one API's requests: what a compatible provider is
 * sent, and nothing else (requirement `harness-bridge.compatible-request`).
 */
export interface KnownRequest {
  /** The API's name as people know it, such as `Anthropic`, for error messages. */
  name: string;
  /** The top-level fields the API's own reference names. */
  fields: ReadonlySet<string>;
  /** True for a tool, by its `type`, that the program runs itself. `undefined` is a tool without a `type`. */
  isProgramTool(type: unknown): boolean;
  /** True for a `tool_choice` that names only tools the program runs itself, or none. */
  isKnownToolChoice(choice: unknown): boolean;
}

/**
 * Refuses a model request for a compatible provider that holds anything the
 * bridge doesn't know: a top-level field `known` doesn't name, a tool or a
 * `tool_choice` the program doesn't run itself, or a model that asks the
 * provider to search the web, such as OpenRouter's `:online` suffix. A
 * compatible provider has its own ways to reach the network from its side,
 * such as OpenRouter's `plugins`, where the sandbox's network fence can't
 * see them (HAL-2076), so the bridge keeps only what it knows rather than
 * removing what it knows to be risky. It refuses rather than dropping, so the
 * person sees why the call failed.
 *
 * The error names the first field or tool type it refuses, never a value.
 *
 * @throws KindedError `denied` when the request holds something unknown
 */
export function refuseUnknownAtCompatible(request: unknown, known: KnownRequest): void {
  if (!isPlainObject(request)) return;
  const provider = `the ${known.name}-compatible provider`;

  const unknownField = Object.keys(request).find((field) => !known.fields.has(field));
  if (unknownField !== undefined) {
    throw new KindedError(
      "denied",
      `The request has the field ${quoted(unknownField)}, which Halonic doesn't send to ${provider}: it only sends the fields the ${known.name} API names.`,
    );
  }
  refuseUnknownTools(request["tools"], known, provider);
  if (Object.hasOwn(request, "tool_choice") && !known.isKnownToolChoice(request["tool_choice"])) {
    throw new KindedError(
      "denied",
      `The request's tool_choice names a tool Halonic doesn't send to ${provider}: it only sends tools the program runs itself.`,
    );
  }
  const model = request["model"];
  if (typeof model === "string" && model.toLowerCase().endsWith(":online")) {
    throw new KindedError(
      "denied",
      `The model ends in ":online", which makes ${provider} search the web from its own side, out of Halonic's sight. Name the model without it.`,
    );
  }
}

/** Refuses the first tool in `tools` whose `type` the program doesn't run itself. */
function refuseUnknownTools(tools: unknown, known: KnownRequest, provider: string): void {
  if (!Array.isArray(tools)) return;
  for (const tool of tools) {
    const type = isPlainObject(tool) ? tool["type"] : null;
    if (!known.isProgramTool(type)) {
      throw new KindedError(
        "denied",
        `The request has a tool of the type ${quoted(type)}, which Halonic doesn't send to ${provider}: it only sends tools the program runs itself.`,
      );
    }
  }
}

/**
 * A field name or a tool type, as an error may show it: quoted, and cut to
 * 64 characters, so a long name can't fill the error.
 */
function quoted(name: unknown): string {
  const text = typeof name === "string" ? name : String(name);
  return JSON.stringify(text.length > 64 ? `${text.slice(0, 64)}…` : text);
}
