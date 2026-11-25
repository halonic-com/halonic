import { EmptyState } from "@halonicjs/studio-kit";
import type { WorkspaceContext } from "../workspace-context.ts";

/**
 * The words every place says with nothing connected (`shell.no-connections`): those of Settings ›
 * Connections with no connection (Noah's wording table on HAL-17498). Each place adds its own line
 * on what connecting gives it.
 */
export const noConnectionsWords = {
  title: "No connections",
  connect: "Connect Paperclip",
} as const;

/** The props of {@link NoConnections}. */
export interface NoConnectionsProps {
  /** What connecting Paperclip gives this place, such as "Connect Paperclip to see …". */
  readonly line: string;
  /** Opens Settings › Connections; without it there is no button. */
  readonly onConnect?: (() => void) | undefined;
}

/**
 * A place with no `AgentMessaging` source (`shell.no-connections`): "No connections", the place's
 * line, and **Connect Paperclip** when the window can open Settings. Places such as the Messenger
 * and Overview show it instead of an empty list that looks like a Paperclip with nothing in it.
 */
export function NoConnections({ line, onConnect }: NoConnectionsProps) {
  return (
    <div className="m-auto max-w-md">
      <EmptyState
        title={noConnectionsWords.title}
        description={line}
        {...(onConnect === undefined
          ? {}
          : { action: { label: noConnectionsWords.connect, onClick: onConnect } })}
      />
    </div>
  );
}

/** Opens Settings › Connections from `context`, or undefined when its window can't open Settings. */
export function connectFrom(context: WorkspaceContext): (() => void) | undefined {
  const { openSettings } = context;
  return openSettings === undefined ? undefined : () => openSettings("connections");
}
