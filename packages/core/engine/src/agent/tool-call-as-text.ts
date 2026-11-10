// Some local models write a tool call out as JSON text instead of making
// one, bare or in the `<tool_call>` tags of the Hermes and Qwen chat templates. The turn never runs such a call, because it can't tell a call from an
// example in the answer, but the run log marks it so a person can see why
// nothing happened.

import type { ChatResponse } from "@halonicjs/ports";

/** A code fence around the whole answer, with an optional language such as `json`. */
const fenced = /^```[A-Za-z]*\s*\n([\s\S]*?)\n?```$/;

/** One `<tool_call>` tag at the start of the text; a model that stops at the closing tag leaves it out. */
const tagged = /^<tool_call>([\s\S]*?)(?:<\/tool_call>\s*|$)/;

/**
 * Whether an answer made no tool call but its text, alone, in one code
 * fence, or in one or more `<tool_call>` tags, is a JSON call to an offered
 * tool: `{"name": …, "arguments": …}`.
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
  const calls = taggedCalls(text) ?? [fenced.exec(text)?.[1] ?? text];
  return calls.every((json) => isWrittenCall(json, offered));
}

/**
 * The text inside each `<tool_call>` tag when the whole text is such tags,
 * or undefined when it isn't.
 */
function taggedCalls(text: string): string[] | undefined {
  if (!text.startsWith("<tool_call>")) {
    return undefined;
  }
  const calls: string[] = [];
  let rest = text;
  while (rest.length > 0) {
    const tag = tagged.exec(rest);
    if (tag === null) {
      return undefined;
    }
    calls.push((tag[1] ?? "").trim());
    rest = rest.slice(tag[0].length);
  }
  return calls;
}

/** Whether `json` is a JSON object with the `name` of an offered tool and its `arguments`. */
function isWrittenCall(json: string, offered: { has(name: string): boolean }): boolean {
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
