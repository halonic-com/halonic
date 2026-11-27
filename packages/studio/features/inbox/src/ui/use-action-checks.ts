import type { HostSettings } from "@halonicjs/app";
import {
  type ConnectedPaperclip,
  type RequesterPolicy,
  type ServerChoice,
  type ServerSessionShell,
  type StepperCatalog,
  serverChoice,
  useConnectedPaperclips,
} from "@halonicjs/studio-feature-action-steppers/api";
import { serverSessionPrefs } from "@halonicjs/studio-feature-settings/api";
import type { ActionSteps, AgentConnection, AgentConnections } from "@halonicjs/studio-services";
import { useEffect, useReducer, useState } from "react";

/**
 * What "Run with Claude" needs from the window (`inbox.run-with-claude`): the shell that opens a
 * terminal, the host settings that keep Settings › Your server, and how Settings opens.
 */
export interface ServerSessionHost {
  /** Only the desktop app on macOS and Linux has one; elsewhere the manual guide shows. */
  readonly shell?: ServerSessionShell | undefined;
  /** Where Settings › Your server is kept; without it no server is set up. */
  readonly settings?: HostSettings | undefined;
  /** Opens Settings on a section; without it, **Set up your server in Settings first** does nothing. */
  readonly openSettings?: ((sectionId?: string) => void) | undefined;
}

/** What a server-session item is checked against and started with. */
export interface ServerSessionChecks {
  readonly shell: ServerSessionShell | undefined;
  readonly server: ServerChoice;
  readonly openSettings: () => void;
  /** The Paperclip origin of the connection whose ID is `source`, or `undefined` when none is. */
  readonly originOf: (source: string) => string | undefined;
}

/**
 * What an action item is checked against when it opens, the installed catalog, the user's policy
 * and the Paperclips they connected, what runs its steps, and what a server session starts with.
 */
export interface ActionChecks {
  readonly catalog: StepperCatalog;
  readonly policy: RequesterPolicy;
  readonly steps: ActionSteps;
  readonly paperclips: readonly ConnectedPaperclip[];
  readonly serverSession: ServerSessionChecks;
}

/** What {@link useActionChecks} builds the checks from. */
export interface ActionCheckParts {
  readonly catalog: StepperCatalog;
  readonly policy: RequesterPolicy;
  readonly steps: ActionSteps;
  readonly connections: AgentConnections | undefined;
  readonly serverSession: ServerSessionHost | undefined;
}

/** The section of Settings that keeps the user's server. */
const serverSection = "server-session";

/**
 * The checks an agent's action item opens with, read again whenever the connections or Settings ›
 * Your server change.
 */
export function useActionChecks(parts: ActionCheckParts): ActionChecks {
  const { catalog, policy, steps, connections, serverSession } = parts;
  const paperclips = useConnectedPaperclips(connections);
  const origins = useRequesterOrigins(connections);
  const server = useServerChoice(serverSession?.settings);
  const openSettings = serverSession?.openSettings;
  return {
    catalog,
    policy,
    steps,
    paperclips,
    serverSession: {
      shell: serverSession?.shell,
      server,
      openSettings: () => openSettings?.(serverSection),
      originOf: (source) => origins.get(source),
    },
  };
}

/**
 * The origin of each Paperclip connection, by its ID, which is its `MessagingSource`'s: the
 * requester's origin always comes from here, never from the request. An address that doesn't
 * parse gives none.
 */
export function requesterOrigins(
  connections: readonly AgentConnection[],
): ReadonlyMap<string, string> {
  const origins = new Map<string, string>();
  for (const connection of connections) {
    if (connection.provider !== "paperclip" || !URL.canParse(connection.address)) continue;
    origins.set(connection.id, new URL(connection.address).origin);
  }
  return origins;
}

const noOrigins: ReadonlyMap<string, string> = new Map();

/** {@link requesterOrigins} of the window's connections, read again whenever they change. */
function useRequesterOrigins(
  connections: AgentConnections | undefined,
): ReadonlyMap<string, string> {
  const [origins, setOrigins] = useState(noOrigins);
  useEffect(() => {
    if (connections === undefined) return;
    let live = true;
    const read = () => {
      connections.list().then(
        (listed) => {
          if (live) setOrigins(requesterOrigins(listed));
        },
        (error: unknown) => console.error("The Inbox couldn't read the connections", error),
      );
    };
    read();
    const stop = connections.subscribe(read);
    return () => {
      live = false;
      stop();
    };
  }, [connections]);
  return origins;
}

/** Settings › Your server as a {@link ServerChoice}; not set up before the settings load. */
function serverOf(settings: HostSettings | undefined): ServerChoice {
  if (settings?.loaded !== true) return { kind: "not-set-up" };
  return serverChoice({
    host: settings.get(serverSessionPrefs.host),
    user: settings.get(serverSessionPrefs.user),
    port: settings.get(serverSessionPrefs.port),
  });
}

const serverKeys: readonly string[] = Object.values(serverSessionPrefs).map(
  (setting) => setting.key,
);

/**
 * {@link serverOf} the host settings. It is read on every draw, since `onChange` hears only
 * changes made elsewhere; a change to Settings › Your server from elsewhere draws again.
 */
function useServerChoice(settings: HostSettings | undefined): ServerChoice {
  const [, drawAgain] = useReducer((draws: number) => draws + 1, 0);
  useEffect(
    () =>
      settings?.onChange((keys) => {
        if (keys.some((key) => serverKeys.includes(key))) drawAgain();
      }),
    [settings],
  );
  return serverOf(settings);
}
