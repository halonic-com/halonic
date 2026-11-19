import type { BridgeProviderAccess } from "@halonicjs/ports";
import { isPlainObject, KindedError } from "@halonicjs/std";

/**
 * Refuses a keyed call that could spend the key on a model the host didn't
 * resolve for the agent (requirement `harness-bridge.keyed-model`): a
 * `model` that isn't exactly one of the access's `models`, a request with
 * Messages' `fallbacks`, or a tool that calls a model of its own: one that
 * names a `model`, or Responses' `image_generation`, whose default model
 * is OpenAI's. The program writes the request, so without
 * this it could call a model the host gave no price, which no cost limit or
 * budget would count. Call it before the key is read.
 *
 * A sign-in access, and a keyed access without `models`, pass unchecked
 * here: at a compatible provider, `refuseUnknownAtCompatible` refuses a
 * missing list itself.
 *
 * The error names no value of the request and none of `models`.
 *
 * @throws KindedError `denied` when the request reaches a model outside `models`
 */
export function refuseModelsNotGiven(access: BridgeProviderAccess, request: unknown): void {
  if (access.kind !== "key" || access.models === undefined) return;
  const fields = isPlainObject(request) ? request : {};
  const model = fields["model"];
  if (typeof model !== "string" || !access.models.includes(model)) {
    throw new KindedError(
      "denied",
      "The request names a model that isn't this agent's: Halonic sends its key only with the models of the agent's model alias.",
    );
  }
  if (Object.hasOwn(fields, "fallbacks")) {
    throw new KindedError(
      "denied",
      "The request has the field \"fallbacks\", which could call other models with this agent's key. Halonic sends only the models of the agent's model alias.",
    );
  }
  if (hasModelTool(fields["tools"])) {
    throw new KindedError(
      "denied",
      "The request has a tool that calls a model of its own, which could call other models with this agent's key. Halonic sends only the models of the agent's model alias.",
    );
  }
}

/** True when one of `tools` calls a model of its own. */
function hasModelTool(tools: unknown): boolean {
  if (!Array.isArray(tools)) return false;
  return tools.some(
    (tool) =>
      isPlainObject(tool) && (Object.hasOwn(tool, "model") || tool["type"] === "image_generation"),
  );
}
