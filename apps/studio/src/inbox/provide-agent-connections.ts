import {
  AgentHostPaperclipKey,
  AgentHostPaperclipSignIn,
  AgentHostServerEngine,
  type AgentHostTransport,
} from "@halonicjs/adapter-agent-host-client";
import type { ServiceRegistry } from "@halonicjs/app";
import {
  AgentConnectionsService,
  HostAgentConnections,
  hostServerEngine,
  type RestoreTrust,
  restoreWhenMayStart,
  ServerEngineService,
  tokenStoreKey,
} from "@halonicjs/studio-services";

/**
 * Provides the desktop engine's connections for the open workspace, so
 * Settings › Connections shows and the Connect dialog signs in through the
 * agent host (ADR 2026-11-24, agent messaging, "Sign-in"). The approved key
 * goes straight to the keychain's tokens. Once the workspace may start
 * something (the person trusted it, or it reaches only the test model), it
 * gives the host back the keys they signed in with in it, quietly, so a
 * restart doesn't ask them to sign in again (`services.paperclip-restore`);
 * a folder that needs trust and has none starts nothing. It also provides
 * the workspace's server engine, for the Messaging engine row
 * (`services.server-engine`).
 * Without an agent host nothing is provided, and Settings shows no
 * Connections section.
 *
 * @param location - the workspace's real path, which the host binds keys to
 */
export function provideAgentConnections(
  services: ServiceRegistry,
  transport: AgentHostTransport | undefined,
  location: string,
  trust: RestoreTrust,
): void {
  if (transport === undefined) return;
  // Read when a key comes or goes, so the keychain is the one the window has then.
  const tokens = {
    get: (name: string) => services.get(tokenStoreKey).get(name),
    set: (name: string, value: string) => services.get(tokenStoreKey).set(name, value),
    remove: (name: string) => services.get(tokenStoreKey).remove(name),
  };
  const connections = new HostAgentConnections({
    signIn: new AgentHostPaperclipSignIn(transport, location),
    host: new AgentHostPaperclipKey(transport),
    tokens,
    workspace: location,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: Date.now,
    report: (error) => console.error("Paperclip sign-in", error),
  });
  services.provide(AgentConnectionsService, connections);
  services.provide(
    ServerEngineService,
    hostServerEngine(new AgentHostServerEngine(transport, location)),
  );
  // Not awaited: the workspace opens at once, and a row shows Sign in again until its key is back.
  restoreWhenMayStart(trust, () => connections.restore());
}
