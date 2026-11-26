// Which of `failedCallWords` a failed tool call's line says, and with which
// names from the log, as text and names to fill. Studio draws the names in
// code style or italics; `halonic runs show` prints them plain. Moved from
// Studio so both say the same (HAL-15149).

import type { ToolFailureCause, ToolNotMadeReason } from "@halonicjs/events";
import type { ConnectorStartCause, FailedCall } from "./failed-call-model.ts";
import { failedCallWords } from "./failed-call-words.ts";

/** One of the lines and parts of {@link failedCallWords}. */
export type FailedCallKey = keyof typeof failedCallWords;

/**
 * A name from the log in a line. A tool, a program or a secret looks like
 * `code`; a connector or a plugin, both names from the workspace, looks
 * like a `name` (Studio's italics).
 */
export interface FailedCallName {
  readonly name: string;
  readonly look: "code" | "name";
  /** Set for a plugin's name, which Studio makes a link to the plugin's own page (HAL-15453). */
  readonly plugin?: true;
}

/** A line of {@link failedCallWords} with a value for each `{name}` in it. */
export interface FailedCallText {
  readonly key: FailedCallKey;
  readonly values: Readonly<Record<string, FailedCallValue>>;
}

/** What fills a `{name}`: a name from the log, a part such as "60 seconds", or a count. */
export type FailedCallValue = FailedCallName | FailedCallText | number;

/**
 * The line under a failed call to `tool`: the logged cause's line when there
 * is one, else the `unknown` outcome's line, else only that it didn't work.
 * A refused service's cause gets its own line only with the outcome `error`.
 * Names from the log (the tool, the connector, a program or a secret) are
 * values, never part of a sentence a value could change.
 *
 * @example
 * failedCallLine("search_pages", { cause: { code: "time-limit", seconds: 60 }, connector: "notion" });
 * // { key: "timeLimit", values: { tool: { key: "toolFrom", … }, connector: …, seconds: { key: "seconds", values: { count: 60 } } } }
 */
export function failedCallLine(tool: string, failed: FailedCall): FailedCallText {
  const toolName: FailedCallName = { name: tool, look: "code" };
  const connector: FailedCallName | undefined =
    failed.connector === undefined ? undefined : { name: failed.connector, look: "name" };
  const values = {
    tool:
      connector === undefined
        ? toolName
        : { key: "toolFrom" as const, values: { tool: toolName, connector } },
    connector: connector ?? { key: "connectorOfTool" as const, values: { tool: toolName } },
  };
  const { cause } = failed;
  if (cause === undefined) {
    return failed.reason === "no-answer"
      ? { key: "noAnswer", values }
      : { key: "failed", values: {} };
  }
  switch (cause.code) {
    case "service-refused":
      // An `unknown` outcome means an earlier write may have gone through, so trying again could
      // do its work twice: it keeps the "may or may not have done its work" line (HAL-19172, PR 2).
      return failed.reason === "no-answer"
        ? { key: "noAnswer", values }
        : serviceRefusedLine(cause, values.tool);
    case "time-limit":
      return { key: "timeLimit", values: { ...values, seconds: secondsOf(cause) } };
    case "engine-stopped":
      return { key: "engineStopped", values };
    case "not-made":
      return { key: notMadeKeys[cause.why], values };
    case "connector-not-started":
      return { key: connectorStartKey(cause), values: { ...values, name: namedInCause(cause) } };
  }
}

/**
 * The line for a connector that couldn't list its tools when a turn
 * started, so the turn went without them: "Couldn't list the tools from
 * *notes*: its program `acme-notes-mcp` isn't on this computer."
 */
export function connectorNotStartedLine(
  connector: string,
  cause: ConnectorStartCause,
): FailedCallText {
  return {
    key: listingKeys[connectorStartKey(cause)],
    values: { connector: { name: connector, look: "name" }, name: namedInCause(cause) },
  };
}

/**
 * The line as text and names, in order, with each part filled in, so a
 * screen only has to draw the names.
 *
 * @throws Error when the words name a value that isn't given, so a missing
 *   value never shows as `{tool}`
 * @example
 * failedCallParts(failedCallLine("create_note", { reason: "no-answer" }));
 * // ["Didn't work: the tool ", { name: "create_note", look: "code" }, " broke off without an answer, …"]
 */
export function failedCallParts(line: FailedCallText): (string | FailedCallName)[] {
  // split() with a capture group gives text, name, text, name, …: the odd parts are names.
  return failedCallWords[line.key].split(/\{(\w+)\}/).flatMap((part, index) => {
    if (index % 2 === 0) return part === "" ? [] : [part];
    if (!Object.hasOwn(line.values, part)) throw new Error(`${line.key}: no value for {${part}}`);
    const value = line.values[part] as FailedCallValue;
    if (typeof value === "number") return [String(value)];
    return "key" in value ? failedCallParts(value) : [value];
  });
}

/** The line for each reason the engine didn't make a call. */
const notMadeKeys: Readonly<Record<ToolNotMadeReason, FailedCallKey>> = {
  "not-connected": "notConnected",
  "tool-gone": "toolGone",
  "sending-off": "sendingOff",
  "bad-arguments": "badArguments",
};

type StartLineKey =
  | "notStarted"
  | "programMissing"
  | "secretNotSet"
  | "pluginNotTrusted"
  | "pluginChanged"
  | "pluginStopped"
  | "sandboxNotReady";

/**
 * The line for a connector that didn't start: the program or the secret it missed, or the plugin
 * that isn't trusted yet, changed since or whose sandbox didn't work when it started, when the
 * cause names it, or the sandbox its plugin runs in that can't start on this computer, which needs
 * no name; else only that it didn't start. The plugin lines have no button: the plugin's own page
 * has the trust step, and the plugin's name is the way there (HAL-15278, HAL-15453); the sandbox
 * line has none either, as R11 has none (C655 row 49).
 */
function connectorStartKey(cause: ConnectorStartCause): StartLineKey {
  if (cause.why === "sandbox-not-ready") return "sandboxNotReady";
  if (cause.name === undefined) return "notStarted";
  switch (cause.why) {
    case "program-missing":
      return "programMissing";
    case "secret-not-set":
      return "secretNotSet";
    case "plugin-not-trusted":
      return "pluginNotTrusted";
    case "plugin-changed":
      return "pluginChanged";
    case "plugin-stopped":
      return "pluginStopped";
    // No words of their own in the run view yet: they read as one that didn't start (HAL-15606,
    // HAL-15689; Studio's words for a refused unfenced start come with HAL-15144's yes).
    case "program-stopped":
    case "unfenced-not-allowed":
    case "other":
      return "notStarted";
  }
}

/** The line for a connector that couldn't list its tools, for each of {@link connectorStartKey}'s. */
const listingKeys: Readonly<Record<StartLineKey, FailedCallKey>> = {
  notStarted: "listingFailed",
  programMissing: "listingProgramMissing",
  secretNotSet: "listingSecretNotSet",
  pluginNotTrusted: "listingPluginNotTrusted",
  pluginChanged: "listingPluginChanged",
  pluginStopped: "listingPluginStopped",
  sandboxNotReady: "listingSandboxNotReady",
};

/**
 * The name a connector-start cause holds: a plugin looks like a name, as the connector does,
 * since both are names from the workspace; a program or a secret looks like code. Empty for a
 * cause without one, whose line doesn't name it. A stopped plugin's cause holds its name, not
 * its id, so it isn't marked as a plugin: there's no page to open by it.
 */
function namedInCause(cause: ConnectorStartCause): FailedCallName {
  const name = cause.name ?? "";
  if (cause.why === "plugin-stopped") return { name, look: "name" };
  return cause.why === "plugin-not-trusted" || cause.why === "plugin-changed"
    ? { name, look: "name", plugin: true }
    : { name, look: "code" };
}

type ServiceRefusedCause = Extract<ToolFailureCause, { code: "service-refused" }>;

/**
 * The line for a call the service refused, or Halonic refused for it: by
 * the cause's `why`, with the host as code for an undeclared one. A 429's
 * line says how often Halonic tried again, and "Nothing was sent twice."
 * only when the cause's `sentOnce` says so, never from the tool's risk.
 */
function serviceRefusedLine(cause: ServiceRefusedCause, tool: FailedCallValue): FailedCallText {
  switch (cause.why) {
    case "not-accepted":
      return { key: "serviceNotAccepted", values: { tool } };
    case "not-allowed":
      return { key: "serviceNotAllowed", values: { tool } };
    case "host-not-declared":
      return { key: "hostNotDeclared", values: { tool, host: { name: cause.host, look: "code" } } };
    case "slow-down": {
      const line: FailedCallText =
        cause.retries === 0
          ? { key: "serviceSlowDown", values: { tool } }
          : {
              key: "serviceSlowDownRetried",
              values: { tool, times: { key: cause.retries === 1 ? "once" : "twice", values: {} } },
            };
      return cause.sentOnce === true ? { key: "nothingSentTwice", values: { line } } : line;
    }
  }
}

/** "60 seconds", or "1 second". */
function secondsOf(cause: Extract<ToolFailureCause, { code: "time-limit" }>): FailedCallText {
  return cause.seconds === 1
    ? { key: "second", values: {} }
    : { key: "seconds", values: { count: cause.seconds } };
}
