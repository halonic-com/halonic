import { type Agent, type AgentMethod, defaultWorkingFolder } from "@halonicjs/format";
import { deepEqual } from "@halonicjs/std";
import {
  countOf,
  fieldOf,
  keysInOrder,
  listChange,
  nameFromId,
  sentencesChanged,
  wholeItemLine,
} from "./describe-fields.ts";
import type { ChangeLine } from "./revert-parts.ts";

/**
 * The agent's fields, in the order their lines are listed. A field not
 * listed here gets a line too, after these, under its key. `methods` have a
 * line each.
 */
const AGENT_FIELDS: Readonly<Record<string, string>> = {
  name: "Name",
  description: "Description",
  instructions: "Instructions",
  model: "Model",
  params: "Model settings",
  skills: "Skills",
  knowledge: "Knowledge",
  connectors: "Connections",
  collections: "Collections",
  subagents: "Agents it can hand tasks to",
  runLogs: "Run history access",
  harness: "Runs in",
  workingFolder: "Working folder",
  allowedSites: "Sites it can reach",
  output: "Reply format",
  maxSteps: "Most model calls",
  character: "Character",
  version: "Format version",
  id: "Id",
};

/**
 * The fields marked Important (Changes design, save model 2.6): what the
 * agent is told, what it may use and reach, and the sandbox it runs in.
 */
const IMPORTANT_FIELDS: ReadonlySet<string> = new Set([
  "instructions",
  "skills",
  "connectors",
  "collections",
  "subagents",
  "runLogs",
  "harness",
  "workingFolder",
  "allowedSites",
]);

/** Fields of a list of names, described as "added …, removed …". */
const LIST_FIELDS: ReadonlySet<string> = new Set([
  "skills",
  "knowledge",
  "connectors",
  "collections",
  "subagents",
  "allowedSites",
]);

/** Fields whose values are short enough to show as before → after. */
const VALUE_FIELDS: ReadonlySet<string> = new Set([
  "name",
  "model",
  "harness",
  "workingFolder",
  "maxSteps",
  "version",
  "id",
]);

/** How a method's fields are named in "Method changed: Extract invoice (instructions, tools)". */
const METHOD_FIELDS: Readonly<Record<string, string>> = {
  description: "description",
  input: "arguments",
  instructions: "instructions",
  tools: "tools",
  model: "model",
  maxSteps: "most model calls",
  output: "answer",
};

/**
 * Describes what changed between two versions of an agent, one line per
 * field and one per method added, removed or changed, each with the part it
 * covers. Instructions, what the agent may use and reach, and its sandbox
 * are marked important, and so is a method whose instructions or tools
 * changed. No line needs another: an agent's fields don't point at each
 * other.
 *
 * An agent that is new or deleted as a whole gets one line, "New" or
 * "Deleted", with no parts: undoing it is undoing the file.
 *
 * @param before - the agent as it was (`undefined` if it's new)
 * @param after - the agent as it is (`undefined` if it was deleted)
 *
 * @example
 * describeAgentChange(lastVersion, current);
 * // [{ id: "field:instructions", sentence: "Instructions edited: 2 sentences changed", important: true, parts: [["instructions"]] },
 * //  { id: "field:model", sentence: "Model: claude → gpt", parts: [["model"]] }]
 */
export function describeAgentChange(
  before: Agent | undefined,
  after: Agent | undefined,
): ChangeLine[] {
  if (before === undefined || after === undefined) {
    return wholeItemLine(before, after);
  }

  const lines: ChangeLine[] = [];
  const fields = keysInOrder(AGENT_FIELDS, before, after).filter((field) => field !== "methods");
  for (const field of fields) {
    const line = fieldLine(field, before, after);
    if (line !== undefined) {
      lines.push(line);
    }
  }
  for (const methodId of keysInOrder({}, before.methods, after.methods)) {
    const line = methodLine(methodId, before.methods[methodId], after.methods[methodId]);
    if (line !== undefined) {
      lines.push(line);
    }
  }
  return lines;
}

function fieldLine(field: string, before: Agent, after: Agent): ChangeLine | undefined {
  const was = fieldOf(before, field);
  const is = fieldOf(after, field);
  if (deepEqual(was, is)) {
    return undefined;
  }
  // A list left out and an empty list mean the same to the sandbox
  // (`agent.allowedSites ?? []`), so that change isn't one.
  if (LIST_FIELDS.has(field) && deepEqual(namesIn(was), namesIn(is))) {
    return undefined;
  }
  return {
    id: `field:${field}`,
    sentence: `${AGENT_FIELDS[field] ?? field}${fieldChange(field, was, is, before, after)}`,
    ...(IMPORTANT_FIELDS.has(field) ? { important: true } : {}),
    parts: [[field]],
  };
}

/** What follows the field's label: ": claude → gpt", " edited: 1 sentence changed", " added". */
function fieldChange(
  field: string,
  was: unknown,
  is: unknown,
  before: Agent,
  after: Agent,
): string {
  if (field === "instructions") {
    return textChange(String(was), String(is));
  }
  if (field === "runLogs") {
    return `: ${was === true ? "on" : "off"} → ${is === true ? "on" : "off"}`;
  }
  if (LIST_FIELDS.has(field)) {
    return `: ${listChange(namesIn(was), namesIn(is))}`;
  }
  if (VALUE_FIELDS.has(field)) {
    return `: ${shownValue(field, was, before)} → ${shownValue(field, is, after)}`;
  }
  if (field === "output") {
    return replyFormatChange(was as Agent["output"], is as Agent["output"]);
  }
  if (was === undefined) {
    return " added";
  }
  return is === undefined ? " removed" : " edited";
}

/** " added", " removed" or " edited: 2 sentences changed", for instructions. */
function textChange(was: string, is: string): string {
  if (was === "") {
    return " added";
  }
  if (is === "") {
    return " removed";
  }
  return ` edited: ${countOf(sentencesChanged(was, is), "sentence")} changed`;
}

function namesIn(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

/** A field's value as shown, with what Halonic uses when it's left out. */
function shownValue(field: string, value: unknown, agent: Agent): string {
  if (value !== undefined) {
    return String(value);
  }
  if (field === "model") {
    return "the workspace's default";
  }
  if (field === "harness") {
    return "halonic";
  }
  if (field === "workingFolder") {
    return defaultWorkingFolder(agent.id);
  }
  return "none";
}

function replyFormatChange(was: Agent["output"], is: Agent["output"]): string {
  return was.type === is.type ? " edited" : `: ${was.type} → ${is.type}`;
}

function methodLine(
  methodId: string,
  was: AgentMethod | undefined,
  is: AgentMethod | undefined,
): ChangeLine | undefined {
  if (deepEqual(was, is)) {
    return undefined;
  }
  const line = { id: `method:${methodId}`, parts: [["methods", methodId]] };
  const name = nameFromId(methodId);
  if (was === undefined || is === undefined) {
    return {
      ...line,
      sentence: `Method ${was === undefined ? "added" : "removed"}: ${name}`,
      important: true,
    };
  }
  const changed = keysInOrder(METHOD_FIELDS, was, is).filter(
    (field) => !deepEqual(fieldOf(was, field), fieldOf(is, field)),
  );
  const fields = changed.map((field) => METHOD_FIELDS[field] ?? field).join(", ");
  return {
    ...line,
    sentence: `Method changed: ${name} (${fields})`,
    ...(changed.includes("instructions") || changed.includes("tools") ? { important: true } : {}),
  };
}
