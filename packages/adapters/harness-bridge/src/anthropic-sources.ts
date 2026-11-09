import { isPlainObject, KindedError } from "@halonicjs/std";

/**
 * Refuses an Anthropic request with a content block whose `source` is a URL,
 * such as an image or a PDF given as `{ type: "url", url }`. Anthropic would
 * fetch that URL from its own side, where the sandbox's network fence can't
 * see it (HAL-2076). The bridge refuses rather than dropping the block, so the
 * model never answers a request that differs from the one the program sent.
 *
 * It looks at every content block the model reads: the system prompt, each
 * message's content, a tool result's content, and a document whose source is
 * content blocks. A tool call's `input` is data, so it isn't looked at.
 *
 * @throws KindedError `denied` naming the first such block
 */
export function refuseUrlSources(request: unknown): void {
  if (!isPlainObject(request)) return;
  checkBlocks(request["system"], "system");
  const messages = request["messages"];
  if (!Array.isArray(messages)) return;
  messages.forEach((message, index) => {
    if (isPlainObject(message)) checkBlocks(message["content"], `messages[${index}].content`);
  });
}

/** Checks a list of content blocks at `path`, and the blocks inside them. */
function checkBlocks(blocks: unknown, path: string): void {
  if (!Array.isArray(blocks)) return;
  blocks.forEach((block, index) => {
    if (!isPlainObject(block)) return;
    const at = `${path}[${index}]`;
    const source = block["source"];
    if (isPlainObject(source)) {
      if (source["type"] === "url") throw urlSourceRefused(block["type"], at);
      checkBlocks(source["content"], `${at}.source.content`);
    }
    checkBlocks(block["content"], `${at}.content`);
  });
}

function urlSourceRefused(type: unknown, at: string): KindedError {
  const name = typeof type === "string" ? `The ${type} block` : "The block";
  return new KindedError(
    "denied",
    `${name} at ${at} asks Anthropic to fetch a URL, which Halonic doesn't allow. Send the file's data in the request instead.`,
  );
}
