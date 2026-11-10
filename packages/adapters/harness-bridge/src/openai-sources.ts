import { isPlainObject, KindedError } from "@halonicjs/std";

/**
 * Refuses an OpenAI Responses request with an input part that OpenAI would
 * fetch from a URL: an `input_image` whose `image_url` is a URL rather than
 * the image's `data:`, or an `input_file` with a `file_url`. OpenAI would
 * fetch it from its own side, where the sandbox's network fence can't see it
 * (HAL-2076). The bridge refuses rather than dropping the part, so the model
 * never answers a request that differs from the one the program sent.
 *
 * It looks at the parts the model reads: each `input` item's `content`, and a
 * tool call's output given as a list of parts, such as a
 * `function_call_output`'s `output`. A plain text `input` has no parts.
 *
 * @throws KindedError `denied` naming the first such part
 */
export function refuseUrlInputs(request: unknown): void {
  if (!isPlainObject(request)) return;
  const input = request["input"];
  if (!Array.isArray(input)) return;
  input.forEach((item, index) => {
    if (!isPlainObject(item)) return;
    checkParts(item["content"], `input[${index}].content`);
    checkParts(item["output"], `input[${index}].output`);
  });
}

/** Checks a list of input parts at `path`. */
function checkParts(parts: unknown, path: string): void {
  if (!Array.isArray(parts)) return;
  parts.forEach((part, index) => {
    if (isPlainObject(part) && fetchesUrl(part)) {
      throw urlInputRefused(String(part["type"]), `${path}[${index}]`);
    }
  });
}

/** Whether OpenAI would fetch `part` from a URL. */
function fetchesUrl(part: Record<string, unknown>): boolean {
  switch (part["type"]) {
    case "input_image":
      return isUrl(part["image_url"]);
    case "input_file":
      return isUrl(part["file_url"]);
    default:
      return false;
  }
}

/**
 * Whether `value` is a URL OpenAI would fetch. Only a `data:` URL, which
 * carries the data itself, is let through; any other string counts as a URL,
 * so a scheme OpenAI might accept later is refused too.
 */
function isUrl(value: unknown): boolean {
  return typeof value === "string" && !value.startsWith("data:");
}

function urlInputRefused(type: string, at: string): KindedError {
  return new KindedError(
    "denied",
    `The ${type} part at ${at} asks OpenAI to fetch a URL, which Halonic doesn't allow. Send the file's data in the request instead.`,
  );
}
