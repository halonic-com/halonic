import type { RemoteControl } from "@halonicjs/ports";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/**
 * The host's {@link RemoteControl}, on loopback. The app provides it once the host has a pairing
 * service (task B2); until then nothing does, and Studio shows no Remote section.
 */
export const RemoteControlService: ServiceKey<RemoteControl> =
  serviceKey<RemoteControl>("remote.control");
