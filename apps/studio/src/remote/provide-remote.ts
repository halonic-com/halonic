import {
  AgentHostRemoteControl,
  type AgentHostTransport,
} from "@halonicjs/adapter-agent-host-client";
import type { ServiceRegistry } from "@halonicjs/app";
import {
  type KeepAwakeHost,
  KeepAwakeService,
  RemoteControlService,
} from "@halonicjs/studio-feature-remote/api";
import type { TauriIpc } from "@halonicjs/studio-services";

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

/**
 * Gives Settings › Remote the shell's sleep lock (`remote.keep-awake`), in Studio's own main
 * window only: the shell grants `keep_awake_set` to no other window, and served Studio has no shell.
 */
export function provideKeepAwake(
  services: ServiceRegistry,
  ipc: TauriIpc | undefined,
  windowLabel: string | undefined,
): void {
  if (ipc === undefined || windowLabel !== "main") return;
  services.provide(KeepAwakeService, keepAwakeOf(ipc));
}

/**
 * The shell's `keep_awake_set` (HAL-17641). It answers whether the lock is held; a refusal
 * (`failed`, the shell's log says why) or an answer that isn't yes or no is thrown.
 */
export function keepAwakeOf(ipc: TauriIpc): KeepAwakeHost {
  return {
    set: async (keep, remote) => {
      let held: unknown;
      try {
        held = await ipc.invoke("keep_awake_set", { keep, remote });
      } catch (refusal) {
        throw new Error(`keep_awake_set refused: ${String(refusal)}`);
      }
      if (typeof held !== "boolean")
        throw new Error(`keep_awake_set: expected yes or no, got ${JSON.stringify(held)}`);
      return held;
    },
  };
}
