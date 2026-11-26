import {
  AgentHostPaperclipKey,
  AgentHostPaperclipSignIn,
  type AgentHostTransport,
} from "@halonicjs/adapter-agent-host-client";
import type { ServiceRegistry } from "@halonicjs/app";
import {
  AgentConnectionsService,
  HostAgentConnections,
  type RestoreTrust,
  restoreWhenTrusted,
  tokenStoreKey,
} from "@halonicjs/studio-services";

/**
 * Provides the desktop engine's connections for the open workspace, so
 * Settings › Connections shows and the Connect dialog signs in through the
 * agent host (ADR 2026-11-24, agent messaging, "Sign-in"). The approved key
 * goes straight to the keychain's tokens. Once the person has trusted the
 * workspace, it gives the host back the keys they signed in with in it,
 * quietly, so a restart doesn't ask them to sign in again
 * (`services.paperclip-restore`); an untrusted folder starts nothing.
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
  // Not awaited: the workspace opens at once, and a row shows Sign in again until its key is back.
  restoreWhenTrusted(trust, () => connections.restore());
}
