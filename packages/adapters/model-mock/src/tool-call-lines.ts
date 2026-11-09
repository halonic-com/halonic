import type { ToolCall } from "@halonicjs/ports";
import { isPlainObject } from "@halonicjs/std";

const toolCallLine = /^tool:([\w-]+)\s*([\s\S]*)$/;

/**
 * Reads a scripted reply as tool calls. A reply whose every non-blank line has
 * the form `tool:<name> <json arguments>` asks for those tools, several at once
 * as a real model can. Any other reply is plain text, and this returns null.
 *
 * @param reply - the scripted reply
 * @param nextCallId - gives the id of each call, in order
 * @returns the calls, or null when the reply is plain text
 *
 * @example
 * readToolCalls('tool:search {"q":"refund"}', () => "mock_call_1");
 * // [{ id: "mock_call_1", name: "search", arguments: { q: "refund" } }]
 */
export function readToolCalls(reply: string, nextCallId: () => string): ToolCall[] | null {
  const lines = reply.split("\n").filter((line) => line.trim() !== "");
  const matches = lines.map((line) => toolCallLine.exec(line));
  if (matches.length === 0) {
    return null;
  }
  const calls: ToolCall[] = [];
  for (const match of matches) {
    if (match === null) {
      return null;
    }
    const [, name = "", argumentText = ""] = match;
    calls.push({ id: nextCallId(), name, arguments: readArguments(argumentText) });
  }
  return calls;
}

/**
 * The arguments of one scripted call. Text that isn't a JSON object is passed
 * on as `{ input: <text> }`, as the old mock did, so a script can give a tool
 * a plain sentence without quoting it.
 */
function readArguments(text: string): Record<string, unknown> {
  if (text === "") {
    return {};
  }
  const parsed = parseJson(text);
  return isPlainObject(parsed) ? parsed : { input: text };
}

/** The JSON value of `text`, or undefined when it isn't JSON. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Not JSON: the caller passes the text on as it is, which is the documented meaning.
    return undefined;
  }
}
