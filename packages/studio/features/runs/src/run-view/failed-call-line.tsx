import {
  connectorNotStartedLine,
  type FailedCall,
  type FailedCallText,
  failedCallLine,
  failedCallParts,
} from "@halonicjs/app/failed-call";
import { inlineLinkClasses } from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import type { ConnectorNotStarted } from "./step-events-model.ts";

/** Opens a plugin's own page by its id; `undefined` where the window can't open tabs. */
type OpenPlugin = ((pluginId: string) => void) | undefined;

/**
 * "✕ Didn't work: the tool `search_pages` (*notion*) didn't answer within 60 seconds, …", under a
 * tool call that failed, outside its fold so it shows while the arguments are closed
 * (`runs.run-view.step-failed-call`). The ✕ is drawn only; a screen reader hears the words. The
 * words and which of them a call gets are `@halonicjs/app/failed-call`'s, so `halonic runs show`
 * says the same.
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
      {filled(failedCallLine(tool, failed), openPlugin)}
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
      {/* Not a link yet: this line has its own requirement, which doesn't say so. */}
      {filled(connectorNotStartedLine(connector, cause), undefined)}
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
 * The line's words with its names from the log in code style (a tool, a program or a secret) or
 * in italics (a connector or a plugin), never as part of a sentence a value could change.
 *
 * Where the window can open tabs, a plugin's name is an inline link to its own page, which has
 * the trust step, so the line stays quiet but still leads to the fix (HAL-15453). The name in the
 * sentence says where it goes, as "its plugin *files* isn't trusted yet".
 */
function filled(line: FailedCallText, openPlugin: OpenPlugin): ReactNode[] {
  return failedCallParts(line).map((part, index) => {
    if (typeof part === "string") return part;
    // By place, not by name: a line may name the same tool twice.
    if (part.look === "code") {
      return (
        <code key={index} className="font-mono">
          {part.name}
        </code>
      );
    }
    if (part.plugin === undefined || openPlugin === undefined || part.name === "") {
      return <em key={index}>{part.name}</em>;
    }
    const { name } = part;
    return (
      <button
        key={index}
        type="button"
        className={inlineLinkClasses}
        onClick={() => openPlugin(name)}
      >
        <em>{name}</em>
      </button>
    );
  });
}
