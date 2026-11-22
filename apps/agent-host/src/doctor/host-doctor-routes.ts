import { networkProblemOf, nodeCommandSearch } from "@halonicjs/adapter-doctor-node";
import { connectorHostClass } from "@halonicjs/adapter-http-kit";
import { createNodeHttpClient } from "@halonicjs/adapter-http-node";
import { NodeResourceProbe } from "@halonicjs/adapter-system-node";
import type { DoctorServiceOptions } from "@halonicjs/app";
import type { Sandbox, TrustStore } from "@halonicjs/ports";
import type { ProfileFolder } from "@halonicjs/profile";
import { proxySetting } from "../proxy-setting.ts";
import type { HostRoute } from "../server/host-server.ts";
import { doctorRoute } from "./doctor-route.ts";
import { HostDoctor } from "./host-doctor.ts";

/** The parts of the host its doctor runs on. */
export interface HostDoctorPlaces {
  readonly version: string;
  /** The profile folder; `undefined` without one, and then no doctor route is served. */
  readonly profile: ProfileFolder | undefined;
  /** The profile's trust records, which the doctor only reads. */
  readonly trustStore: TrustStore | undefined;
  /** The folders the launcher named as workspaces. */
  readonly workspaceRoots: readonly string[];
  readonly sandbox: Pick<Sandbox, "check" | "capabilities">;
  readonly harnesses: DoctorServiceOptions["harnesses"];
  /** Whether the host runs inside WSL (`--wsl-shared-folders`). */
  readonly onWsl: boolean;
  /** Halonic's own ports on this computer, which no model server's address may be. */
  readonly ownPorts: () => Iterable<number>;
  readonly log: (text: string) => void;
}

/**
 * The doctor route on the host's own parts: its sandbox and harnesses, the
 * profile's trust records and run folders, Node's resource probe, and a
 * client that reaches a model server as a connector's address is reached,
 * through the proxy the host started with. None without a profile folder.
 */
export function hostDoctorRoutes(places: HostDoctorPlaces): HostRoute[] {
  const { profile, trustStore } = places;
  if (profile === undefined || trustStore === undefined) return [];
  const http = createNodeHttpClient({
    hostClass: connectorHostClass,
    proxy: proxySetting,
    ownPorts: places.ownPorts,
  });
  const doctor = new HostDoctor({
    machine: {
      profile,
      trustStore,
      sandbox: places.sandbox,
      probe: new NodeResourceProbe(),
      harnesses: places.harnesses,
      http,
      network: () => networkProblemOf(proxySetting),
    },
    appVersion: places.version,
    commandSearch: nodeCommandSearch(),
    onWsl: places.onWsl,
  });
  return [doctorRoute(doctor, places.workspaceRoots, places.log)];
}
