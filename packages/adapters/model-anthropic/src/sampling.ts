/**
 * Which Claude models take the sampling settings (`temperature`, `top_p`,
 * `top_k`). Anthropic removed them from its newer models, which answer a call
 * that sets one with HTTP 400; Claude Sonnet 5.5 takes only the default.
 * Checked against Anthropic's model reference of 18 Nov 2026 (HAL-12285).
 */

/** The sampling settings under their wire names. */
export const samplingWireNames = ["temperature", "top_p", "top_k"] as const;

/** The models that refuse a sampling setting. */
const refusingModels = new Set([
  "claude-fable-5-1",
  "claude-fable-5",
  "claude-mythos-5-1",
  "claude-mythos-5",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-sonnet-5-5",
  "claude-sonnet-5",
]);

/** The Claude 4 models that still take them. */
const takingModels = new Set([
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "claude-opus-4-5",
  "claude-sonnet-4-5",
  "claude-opus-4-1",
  "claude-opus-4",
  "claude-sonnet-4",
]);

/** Claude 3 and older, which all take them: `claude-3-5-sonnet`, `claude-2-1`, `claude-instant-1-2`. */
const olderClaude = /^claude-(?:instant|[123])(?:-|$)/;

/**
 * Whether a call to `model` may set the sampling settings. A model we don't
 * know that is named `claude-*` is taken to be a newer one and may not; a
 * model with another name, such as one behind a proxy, may.
 *
 * @example
 * takesSampling("claude-haiku-4-5-20251001"); // true
 * takesSampling("claude-opus-5-5[1m]"); // false
 * takesSampling("acme-small"); // true
 */
export function takesSampling(model: string): boolean {
  const family = modelFamily(model);
  if (refusingModels.has(family)) return false;
  if (takingModels.has(family) || olderClaude.test(family)) return true;
  return !family.startsWith("claude-");
}

/**
 * The model's id without what only names a version or a place of it, so
 * dated and platform ids match their family: `claude-opus-4-6[1m]`,
 * `claude-sonnet-4-5-20250929`, `claude-opus-4-5@20251101` (Vertex AI) and
 * `us.anthropic.claude-haiku-4-5-20251001-v1:0` (Amazon Bedrock).
 */
function modelFamily(model: string): string {
  const id = model.trim().toLowerCase();
  const start = id.indexOf("claude-");
  const named = start > 0 && id[start - 1] === "." ? id.slice(start) : id;
  return named
    .replace(/\[.*$/, "")
    .replace(/@.*$/, "")
    .replace(/-v\d+(?::\d+)?$/, "")
    .replace(/-latest$/, "")
    .replace(/-\d{8}$/, "");
}
