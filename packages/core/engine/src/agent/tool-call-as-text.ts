// Some local models write a tool call out as JSON text instead of making
// one. The turn never runs such a call, because it can't tell a call from an
// example in the answer, but the run log marks it so a person can see why
// nothing happened.

import type { ChatResponse } from "@halonicjs/ports";

/** A code fence around the whole answer, with an optional language such as `json`. */
const fenced = /^```[A-Za-z]*\s*\n([\s\S]*?)\n?```$/;

/**
 * Whether an answer made no tool call but its text, alone or in one code
 * fence, is a JSON call to an offered tool: `{"name": …, "arguments": …}`.
 *
 * @param offered - the tools the turn offered, by name
 */
export function isToolCallAsText(
  response: ChatResponse,
  offered: { has(name: string): boolean },
): boolean {
  if (response.toolCalls.length > 0) {
    return false;
  }
  const text = response.content.trim();
  const json = fenced.exec(text)?.[1] ?? text;
  const written = parseObject(json);
  if (written === undefined || !("arguments" in written)) {
    return false;
  }
  return typeof written["name"] === "string" && offered.has(written["name"]);
}

function parseObject(json: string): Record<string, unknown> | undefined {
  if (!json.startsWith("{")) {
    return undefined;
  }
  try {
    // Text that starts with `{` and parses is always a JSON object.
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    // Text that isn't JSON is an ordinary answer, not a failure.
    return undefined;
  }
}
