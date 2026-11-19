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
 * Last, it refuses a `model` that isn't exactly one of `models`, the ones
 * the host resolved for this agent at this provider, and every request when
 * the host gave none: a compatible provider can serve models that search the
 * web on their own, such as `perplexity/sonar`.
 *
 * The error names the first field or tool type it refuses, never a value:
 * neither the model nor `models`.
 *
 * @throws KindedError `denied` when the request holds something unknown
 */
export function refuseUnknownAtCompatible(
  request: unknown,
  known: KnownRequest,
  models: readonly string[] | undefined,
): void {
  const provider = `the ${known.name}-compatible provider`;
  if (isPlainObject(request)) refuseUnknownParts(request, known, provider);
  refuseUnresolvedModel(isPlainObject(request) ? request["model"] : undefined, models, provider);
}

/** Refuses an unknown field, tool or `tool_choice`, and the `:online` model suffix. */
function refuseUnknownParts(
  request: Record<string, unknown>,
  known: KnownRequest,
  provider: string,
): void {
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

/**
 * Refuses a model that isn't exactly one of `models`, case and all, and any
 * model when `models` is missing or empty, so a host that forgot the list
 * sends nothing rather than everything.
 */
function refuseUnresolvedModel(
  model: unknown,
  models: readonly string[] | undefined,
  provider: string,
): void {
  if (models === undefined || models.length === 0) {
    throw new KindedError(
      "denied",
      `Halonic has no models for this agent at ${provider}, so it sends it no calls. Check the agent's model alias.`,
    );
  }
  if (typeof model !== "string" || !models.includes(model)) {
    throw new KindedError(
      "denied",
      `The request names a model that isn't this agent's at ${provider}: Halonic sends only the models of the agent's model alias there.`,
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
