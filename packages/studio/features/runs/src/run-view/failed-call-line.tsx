import type { ToolFailureCause, ToolNotMadeReason } from "@halonicjs/events";
import { inlineLinkClasses } from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import { failedCallWords } from "./failed-call-words.ts";
import { fillWords } from "./fill-words.tsx";
import type { ConnectorNotStarted, ConnectorStartCause, FailedCall } from "./step-events-model.ts";

type FailedCallKey = keyof typeof failedCallWords;

/** Opens a plugin's own page by its id; `undefined` where the window can't open tabs. */
type OpenPlugin = ((pluginId: string) => void) | undefined;

/**
 * "✕ Didn't work: the tool `search_pages` (*notion*) didn't answer within 60 seconds, …", under a
 * tool call that failed, outside its fold so it shows while the arguments are closed
 * (`runs.run-view.step-failed-call`). The ✕ is drawn only; a screen reader hears the words.
 */
export function FailedCallLine({
  tool,
  failed,
  openPlugin,
}: {
  readonly tool: string;
  readonly failed: FailedCall;
  /** Opens a plugin's page, for the plugin a connector didn't start for; without it its name isn't a link. */
  readonly openPlugin?: OpenPlugin;
}) {
  return (
    <QuietFailureLine className="px-4 pb-3">
      {failedCallSentence(tool, failed, openPlugin)}
    </QuietFailureLine>
  );
}

/**
 * "✕ Couldn't list the tools from *notes*: its program `acme-notes-mcp` isn't on this computer.",
 * above a step's tool calls, for a connector its turns went without
 * (`runs.run-view.step-connector-not-started`).
 */
export function ConnectorNotStartedLine({
  notStarted,
}: {
  readonly notStarted: ConnectorNotStarted;
}) {
  const { connector, cause } = notStarted;
  return (
    <QuietFailureLine className="py-1.5">
      {fillWords(failedCallWords, listingKeys[connectorStartKey(cause)], {
        connector: <em>{connector}</em>,
        // Not a link yet: this line has its own requirement, which doesn't say so.
        name: namedInCause(cause, undefined),
      })}
    </QuietFailureLine>
  );
}

/** A quiet line after a ✕ that is drawn only; a screen reader hears the words. */
function QuietFailureLine({
  className,
  children,
}: {
  readonly className: string;
  readonly children: ReactNode;
}) {
  return (
    <p className={`${className} text-small text-fg-muted`}>
      <span aria-hidden="true" className="text-danger">
        ✕{" "}
      </span>
      {children}
    </p>
  );
}

/**
 * The words after the ✕: the logged cause's line when there is one, else the `unknown` outcome's
 * line, else only that it didn't work. Names from the log (the tool, the connector, a program or
 * a secret) show in code style or italics, never as part of a sentence a value could change.
 */
function failedCallSentence(tool: string, failed: FailedCall, openPlugin: OpenPlugin): ReactNode[] {
  const toolName = <code className="font-mono">{tool}</code>;
  const connector = failed.connector === undefined ? undefined : <em>{failed.connector}</em>;
  const values = {
    tool:
      connector === undefined
        ? toolName
        : fillWords(failedCallWords, "toolFrom", { tool: toolName, connector }),
    connector: connector ?? fillWords(failedCallWords, "connectorOfTool", { tool: toolName }),
  };
  const { cause } = failed;
  if (cause === undefined) {
    return failed.reason === "no-answer"
      ? fillWords(failedCallWords, "noAnswer", values)
      : fillWords(failedCallWords, "failed");
  }
  switch (cause.code) {
    case "time-limit":
      return fillWords(failedCallWords, "timeLimit", { ...values, seconds: secondsOf(cause) });
    case "engine-stopped":
      return fillWords(failedCallWords, "engineStopped", values);
    case "not-made":
      return fillWords(failedCallWords, notMadeKeys[cause.why], values);
    case "connector-not-started":
      return fillWords(failedCallWords, connectorStartKey(cause), {
        ...values,
        name: namedInCause(cause, openPlugin),
      });
  }
}

/** The line for each reason the engine didn't make a call. */
const notMadeKeys: Readonly<Record<ToolNotMadeReason, FailedCallKey>> = {
  "not-connected": "notConnected",
  "tool-gone": "toolGone",
  "sending-off": "sendingOff",
  "bad-arguments": "badArguments",
};

/**
 * The line for a connector that didn't start: the program or the secret it missed, or the plugin
 * that isn't trusted yet or changed since, when the cause names it, else only that it didn't
 * start. The plugin line has no button: the plugin's own page has the trust step, and the plugin's
 * name is the way there (HAL-15278, HAL-15453).
 */
function connectorStartKey(cause: ConnectorStartCause): StartLineKey {
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
    case "other":
      return "notStarted";
  }
}

/**
 * The name a connector-start cause holds: a plugin in italics, as the connector is, since both
 * are names from the workspace; a program or a secret in code style.
 *
 * Where the window can open tabs, the plugin's name is an inline link to its own page, which has
 * the trust step, so the line stays quiet but still leads to the fix (HAL-15453). The name in the
 * sentence says where it goes, as "its plugin *files* isn't trusted yet".
 */
function namedInCause(cause: ConnectorStartCause, openPlugin: OpenPlugin): ReactNode {
  const { name } = cause;
  if (cause.why !== "plugin-not-trusted" && cause.why !== "plugin-changed") {
    return <code className="font-mono">{name}</code>;
  }
  if (openPlugin === undefined || name === undefined) {
    return <em>{name}</em>;
  }
  return (
    <button type="button" className={inlineLinkClasses} onClick={() => openPlugin(name)}>
      <em>{name}</em>
    </button>
  );
}

type StartLineKey =
  | "notStarted"
  | "programMissing"
  | "secretNotSet"
  | "pluginNotTrusted"
  | "pluginChanged";

/** The line for a connector that couldn't list its tools, for each of {@link connectorStartKey}'s. */
const listingKeys: Readonly<Record<StartLineKey, FailedCallKey>> = {
  notStarted: "listingFailed",
  programMissing: "listingProgramMissing",
  secretNotSet: "listingSecretNotSet",
  pluginNotTrusted: "listingPluginNotTrusted",
  pluginChanged: "listingPluginChanged",
};

/** "60 seconds", or "1 second". */
function secondsOf(cause: Extract<ToolFailureCause, { code: "time-limit" }>): ReactNode[] {
  return cause.seconds === 1
    ? fillWords(failedCallWords, "second")
    : fillWords(failedCallWords, "seconds", { count: cause.seconds });
}
