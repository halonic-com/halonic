import {
  AgentHostPaperclipKey,
  AgentHostPaperclipSignIn,
  type AgentHostTransport,
} from "@halonicjs/adapter-agent-host-client";
import type { ServiceRegistry } from "@halonicjs/app";
import {
  AgentConnectionsService,
  HostAgentConnections,
  tokenStoreKey,
} from "@halonicjs/studio-services";

/**
 * Provides the desktop engine's connections for the open workspace, so
 * Settings › Connections shows and the Connect dialog signs in through the
 * agent host (ADR 2026-11-24, agent messaging, "Sign-in"). The approved key
 * goes straight to the keychain's tokens. Without an agent host nothing is
 * provided, and Settings shows no Connections section.
 *
 * @param location - the workspace's real path, which the host binds keys to
 */
export function provideAgentConnections(
  services: ServiceRegistry,
  transport: AgentHostTransport | undefined,
  location: string,
): void {
  if (transport === undefined) return;
  // Read when a key comes or goes, so the keychain is the one the window has then.
  const tokens = {
    get: (name: string) => services.get(tokenStoreKey).get(name),
    set: (name: string, value: string) => services.get(tokenStoreKey).set(name, value),
    remove: (name: string) => services.get(tokenStoreKey).remove(name),
  };
  services.provide(
    AgentConnectionsService,
    new HostAgentConnections({
      signIn: new AgentHostPaperclipSignIn(transport, location),
      host: new AgentHostPaperclipKey(transport),
      tokens,
      workspace: location,
      wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      now: Date.now,
      report: (error) => console.error("Paperclip sign-in", error),
    }),
  );
}
