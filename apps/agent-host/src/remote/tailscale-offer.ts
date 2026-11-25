import {
  nodeTailscaleRunner,
  type TailscaleRunner,
  TailscaleTunnel,
  tailscaleFunnelHeader,
} from "@halonicjs/adapter-tunnel-tailscale";
import type { RemoteOffer, RemoteProbe } from "./host-remote.ts";

/**
 * The executable's remote: the Tailscale provider, offered only when a
 * `tailscale` program is there to run (decision 1 on HAL-17607), so a
 * computer without Tailscale shows no remote at all. The gateway accepts the
 * node's tailnet name and refuses a request that came through Funnel.
 *
 * @param runner - runs `tailscale`; tests give a scripted one
 */
export function tailscaleProbe(runner: TailscaleRunner = nodeTailscaleRunner()): RemoteProbe {
  return async (): Promise<RemoteOffer | undefined> => {
    const tunnel = new TailscaleTunnel({ runner });
    if (!(await tunnel.installed())) return undefined;
    return {
      tunnel,
      tunnelHosts: () => tunnel.tailnetHosts(),
      publicHeaders: [tailscaleFunnelHeader],
    };
  };
}
