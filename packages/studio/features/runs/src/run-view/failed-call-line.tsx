import type { ToolFailureCause, ToolNotMadeReason } from "@halonicjs/events";
import type { ReactNode } from "react";
import { failedCallWords } from "./failed-call-words.ts";
import { fillWords } from "./fill-words.tsx";
import type { FailedCall } from "./step-events-model.ts";

type FailedCallKey = keyof typeof failedCallWords;

/**
 * "✕ Didn't work: the tool `search_pages` (*notion*) didn't answer within 60 seconds, …", under a
 * tool call that failed, outside its fold so it shows while the arguments are closed
 * (`runs.run-view.step-failed-call`). The ✕ is drawn only; a screen reader hears the words.
 */
export function FailedCallLine({
  tool,
  failed,
}: {
  readonly tool: string;
  readonly failed: FailedCall;
}) {
  return (
    <p className="px-4 pb-3 text-small text-fg-muted">
      <span aria-hidden="true" className="text-danger">
        ✕{" "}
      </span>
      {failedCallSentence(tool, failed)}
    </p>
  );
}

/**
 * The words after the ✕: the logged cause's line when there is one, else the `unknown` outcome's
 * line, else only that it didn't work. Names from the log (the tool, the connector, a program or
 * a secret) show in code style or italics, never as part of a sentence a value could change.
 */
function failedCallSentence(tool: string, failed: FailedCall): ReactNode[] {
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
        name: namedInCause(cause),
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
 * start. The plugin line has no button: the plugin's own page has the trust step (HAL-15278).
 */
function connectorStartKey(
  cause: Extract<ToolFailureCause, { code: "connector-not-started" }>,
): FailedCallKey {
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
 */
function namedInCause(
  cause: Extract<ToolFailureCause, { code: "connector-not-started" }>,
): ReactNode {
  return cause.why === "plugin-not-trusted" || cause.why === "plugin-changed" ? (
    <em>{cause.name}</em>
  ) : (
    <code className="font-mono">{cause.name}</code>
  );
}

/** "60 seconds", or "1 second". */
function secondsOf(cause: Extract<ToolFailureCause, { code: "time-limit" }>): ReactNode[] {
  return cause.seconds === 1
    ? fillWords(failedCallWords, "second")
    : fillWords(failedCallWords, "seconds", { count: cause.seconds });
}
