import {
  AgentHostRemoteControl,
  type AgentHostTransport,
} from "@halonicjs/adapter-agent-host-client";
import type { ServiceRegistry } from "@halonicjs/app";
import { RemoteControlService } from "@halonicjs/studio-feature-remote/api";

/**
 * Gives Settings › Remote the agent host's `RemoteControl` (`studio.remote-control`), when the
 * page is in the desktop app. The host keeps remote's rules and the paired phones; the section
 * shows only while the host says remote is available, which only a host with a tunnel provider
 * does: the agent host executable has none until phase C.
 */
export function provideRemoteControl(
  services: ServiceRegistry,
  transport: AgentHostTransport | undefined,
): void {
  if (transport === undefined) return;
  services.provide(RemoteControlService, new AgentHostRemoteControl(transport));
}
