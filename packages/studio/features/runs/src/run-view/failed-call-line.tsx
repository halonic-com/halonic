import type { ToolFailureCause, ToolNotMadeReason } from "@halonicjs/events";
import type { ReactNode } from "react";
import { failedCallWords } from "./failed-call-words.ts";
import { fillWords } from "./fill-words.tsx";
import type { ConnectorNotStarted, ConnectorStartCause, FailedCall } from "./step-events-model.ts";

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
    <QuietFailureLine className="px-4 pb-3">{failedCallSentence(tool, failed)}</QuietFailureLine>
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
        name: <code className="font-mono">{cause.name}</code>,
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
        name: <code className="font-mono">{cause.name}</code>,
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
 * The line for a connector that didn't start: the program or the secret it missed when the cause
 * names it, else only that it didn't start.
 */
function connectorStartKey(cause: ConnectorStartCause): StartLineKey {
  if (cause.name === undefined || cause.why === "other") return "notStarted";
  return cause.why === "program-missing" ? "programMissing" : "secretNotSet";
}

type StartLineKey = "notStarted" | "programMissing" | "secretNotSet";

/** The line for a connector that couldn't list its tools, for each of {@link connectorStartKey}'s. */
const listingKeys: Readonly<Record<StartLineKey, FailedCallKey>> = {
  notStarted: "listingFailed",
  programMissing: "listingProgramMissing",
  secretNotSet: "listingSecretNotSet",
};

/** "60 seconds", or "1 second". */
function secondsOf(cause: Extract<ToolFailureCause, { code: "time-limit" }>): ReactNode[] {
  return cause.seconds === 1
    ? fillWords(failedCallWords, "second")
    : fillWords(failedCallWords, "seconds", { count: cause.seconds });
}
