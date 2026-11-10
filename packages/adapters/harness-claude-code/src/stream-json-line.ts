/**
 * One line of `claude --output-format stream-json`, with only the parts the
 * harness reads. Every other line type, such as `system` or `stream_event`,
 * is `other`.
 */
export type StreamJsonLine =
  | {
      type: "assistant" | "user";
      /**
       * The id of the subagent tool call this message belongs to, or `null`
       * for the task agent's own messages.
       */
      parentToolUseId: string | null;
      blocks: ContentBlock[];
    }
  | {
      type: "result";
      /** Such as "success" or "error_max_turns". */
      subtype: string;
      isError: boolean;
      /** The agent's answer, or Claude Code's error message. Empty when it has none. */
      text: string;
    }
  | { type: "other" };

/** A part of a message the harness reads: a tool call or its result. Text parts aren't kept. */
export type ContentBlock =
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; toolUseId: string; text: string; isError: boolean };

/**
 * Reads one line Claude Code printed.
 *
 * @returns the line, or `undefined` when it isn't a JSON object with a `type`
 */
export function parseStreamJsonLine(line: string): StreamJsonLine | undefined {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (!isRecord(value) || typeof value["type"] !== "string") return undefined;

  switch (value["type"]) {
    case "assistant":
    case "user":
      return {
        type: value["type"],
        parentToolUseId: stringOr(value["parent_tool_use_id"], null),
        blocks: readBlocks(value["message"]),
      };
    case "result":
      return {
        type: "result",
        subtype: stringOr(value["subtype"], ""),
        isError: value["is_error"] === true,
        text: stringOr(value["result"], ""),
      };
    default:
      return { type: "other" };
  }
}

/** The tool calls and tool results of a message; a part the harness doesn't read is left out. */
function readBlocks(message: unknown): ContentBlock[] {
  if (!isRecord(message) || !Array.isArray(message["content"])) return [];
  const blocks: ContentBlock[] = [];
  for (const part of message["content"]) {
    const block = readBlock(part);
    if (block !== undefined) blocks.push(block);
  }
  return blocks;
}

function readBlock(part: unknown): ContentBlock | undefined {
  if (!isRecord(part)) return undefined;
  if (part["type"] === "tool_use") {
    const { id, name } = part;
    if (typeof id !== "string" || typeof name !== "string") return undefined;
    return { type: "tool_use", id, name, input: part["input"] ?? {} };
  }
  if (part["type"] === "tool_result") {
    const toolUseId = part["tool_use_id"];
    if (typeof toolUseId !== "string") return undefined;
    return {
      type: "tool_result",
      toolUseId,
      text: resultText(part["content"]),
      isError: part["is_error"] === true,
    };
  }
  return undefined;
}

/**
 * A tool result's text. Claude Code writes it as a string, or as a list of
 * parts whose text parts are joined; other parts, such as images, are left out.
 */
function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => isRecord(part) && part["type"] === "text")
    .map((part) => stringOr(part["text"], ""))
    .join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOr<Fallback>(value: unknown, fallback: Fallback): string | Fallback {
  return typeof value === "string" ? value : fallback;
}
