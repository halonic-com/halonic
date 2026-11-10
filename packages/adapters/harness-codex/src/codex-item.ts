import { isPlainObject } from "@halonicjs/std";

/** How a Codex item ended; `inProgress` until its `item/completed`. */
export type ItemStatus = "inProgress" | "completed" | "failed" | "declined" | "interrupted";

/**
 * One item of a Codex turn, as `item/started` and `item/completed` carry it
 * (`ThreadItem` in Codex's app-server protocol), with only the parts the
 * harness reads. Every other item type, such as `reasoning` or
 * `userMessage`, is `other`.
 */
export type CodexItem =
  /** A shell command Codex ran. `output` is its standard output and error together. */
  | {
      type: "commandExecution";
      id: string;
      command: string;
      cwd: string;
      status: ItemStatus;
      output: string;
    }
  /** Files Codex changed with its `apply_patch` tool. */
  | { type: "fileChange"; id: string; changes: FileChange[]; status: ItemStatus }
  /** A call to a tool of an MCP server. `text` is the text of its result, or its error. */
  | {
      type: "mcpToolCall";
      id: string;
      server: string;
      tool: string;
      args: unknown;
      status: ItemStatus;
      text: string;
    }
  /** An image file Codex looked at. */
  | { type: "imageView"; id: string; path: string }
  /** Something the agent said; the last one of a turn is its answer. */
  | { type: "agentMessage"; id: string; text: string }
  /**
   * A call to one of Codex's subagent tools, such as `spawnAgent` or
   * `sendInput`. `receiverThreadIds` are the threads of the subagents it
   * reaches; for `spawnAgent`, the new one's, once the item completes.
   */
  | {
      type: "collabAgentToolCall";
      id: string;
      tool: string;
      status: ItemStatus;
      receiverThreadIds: string[];
      prompt: string;
    }
  | { type: "other" };

/** One file of a `fileChange` item, with the change as a unified diff. */
export interface FileChange {
  path: string;
  kind: "add" | "delete" | "update";
  diff: string;
}

/**
 * Reads the `item` of an `item/started` or `item/completed` notification.
 *
 * @returns the item, `other` for a type the harness doesn't read, or `undefined` when it has no `type` and `id`
 */
export function parseCodexItem(value: unknown): CodexItem | undefined {
  if (!isPlainObject(value)) return undefined;
  const { type, id } = value;
  if (typeof type !== "string" || typeof id !== "string") return undefined;
  switch (type) {
    case "commandExecution":
      return {
        type,
        id,
        command: text(value["command"]),
        cwd: text(value["cwd"]),
        status: statusOf(value["status"]),
        output: text(value["aggregatedOutput"]),
      };
    case "fileChange":
      return {
        type,
        id,
        changes: fileChanges(value["changes"]),
        status: statusOf(value["status"]),
      };
    case "mcpToolCall":
      return {
        type,
        id,
        server: text(value["server"]),
        tool: text(value["tool"]),
        args: value["arguments"] ?? {},
        status: statusOf(value["status"]),
        text: mcpResultText(value["result"], value["error"]),
      };
    case "imageView":
      return { type, id, path: text(value["path"]) };
    case "agentMessage":
      return { type, id, text: text(value["text"]) };
    case "collabAgentToolCall":
      return {
        type,
        id,
        tool: text(value["tool"]),
        status: statusOf(value["status"]),
        receiverThreadIds: texts(value["receiverThreadIds"]),
        prompt: text(value["prompt"]),
      };
    default:
      return { type: "other" };
  }
}

function fileChanges(value: unknown): FileChange[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isPlainObject).map((change) => ({
    path: text(change["path"]),
    kind: changeKind(change["kind"]),
    diff: text(change["diff"]),
  }));
}

/** A change's kind: Codex writes it as `{ "type": "add" }`, with `move_path` for an update that moves the file. */
function changeKind(kind: unknown): FileChange["kind"] {
  const type = isPlainObject(kind) ? kind["type"] : undefined;
  return type === "add" || type === "delete" ? type : "update";
}

/**
 * The text of an MCP tool's result: its text parts, joined, with other
 * parts such as images left out. When the call failed without a result,
 * Codex's error message.
 */
function mcpResultText(result: unknown, error: unknown): string {
  if (isPlainObject(result) && Array.isArray(result["content"])) {
    return result["content"]
      .filter((part) => isPlainObject(part) && part["type"] === "text")
      .map((part) => text(part["text"]))
      .join("\n");
  }
  return isPlainObject(error) ? text(error["message"]) : "";
}

const statuses: ReadonlySet<string> = new Set([
  "inProgress",
  "completed",
  "failed",
  "declined",
  "interrupted",
]);

/** An item's status; one Halonic doesn't know counts as still in progress. */
function statusOf(value: unknown): ItemStatus {
  return typeof value === "string" && statuses.has(value) ? (value as ItemStatus) : "inProgress";
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** The strings of a list; anything else in it is left out. */
function texts(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
}
