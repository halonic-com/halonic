import type { NetworkInterfaceInfo } from "node:os";

/** What `os.networkInterfaces()` returns. */
export type NetworkInterfaces = Readonly<
  Record<string, readonly NetworkInterfaceInfo[] | undefined>
>;

/** Interfaces that only reach containers or virtual machines on this computer, not a phone. */
const VIRTUAL_INTERFACE = /^(docker|br-|veth|virbr|vboxnet|vmnet|cni|flannel)/;

/**
 * The computer's first IPv4 address that isn't internal, in interface-name
 * order, skipping container and virtual-machine bridges, or `undefined` when
 * it has none (for example when it is offline).
 */
export function findLanAddress(interfaces: NetworkInterfaces): string | undefined {
  for (const name of Object.keys(interfaces).sort()) {
    if (VIRTUAL_INTERFACE.test(name)) {
      continue;
    }
    for (const info of interfaces[name] ?? []) {
      if (info.family === "IPv4" && !info.internal) {
        return info.address;
      }
    }
  }
  return undefined;
}
