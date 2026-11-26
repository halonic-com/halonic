import { randomBytes } from "node:crypto";
import { hostname } from "node:os";
import { join } from "node:path";
import { privateFileAt } from "@halonicjs/adapter-fs-node";
import type { PhoneMessaging, RemoteControl, SecretStore, TunnelProvider } from "@halonicjs/ports";
import type { ProfileFolder } from "@halonicjs/profile";
import { systemClock } from "@halonicjs/std";
import { deskAccess } from "../gateway/desk-access.ts";
import { RemoteGateway } from "../gateway/remote-gateway.ts";
import type { RunLedger } from "../gateway/run-ledger.ts";
import type { RunTable } from "../harness/run-table.ts";
import { sharedHostKey } from "./host-key.ts";
import { HostRemoteControl } from "./host-remote-control.ts";
import { PairedPhones } from "./paired-phones.ts";
import { PairingDesk } from "./pairing-desk.ts";
import { RemoteNotOffered } from "./remote-not-offered.ts";
import { RemoteSettings } from "./remote-settings.ts";
import { systemTime } from "./remote-time.ts";

/**
 * What lets the host offer remote: a tunnel provider, the only way a phone
 * reaches the gateway. It is not a launch argument: the executable gives the
 * Tailscale provider when `tailscale` is installed (`tailscale-offer.ts`),
 * and tests give their own (requirement `agent-host.remote-gateway`).
 */
export interface RemoteOffer {
  readonly tunnel: TunnelProvider;
  /** The gateway's loopback port; a free one each time remote turns on when not given. */
  readonly gatewayPort?: number;
  /** The `Host` a request through the tunnel carries, read each time the gateway starts; loopback names only when not given. */
  readonly tunnelHosts?: () => Promise<readonly string[]>;
  /** Headers the tunnel adds only to a request from the public internet; the gateway refuses such a request. */
  readonly publicHeaders?: readonly string[];
}

/** Finds out, once the host serves, whether it may offer remote: `undefined` when it may not. */
export type RemoteProbe = () => Promise<RemoteOffer | undefined>;

/** How the host serves, which decides whether it may offer remote. */
export interface RemoteServing {
  /** Over `--stdio` the host listens on no port (HAL-5396), so the gateway can't either. */
  readonly overStdio: boolean;
  /** Where the paired phones and the switches are kept; without one there is nowhere. */
  readonly profile: ProfileFolder | undefined;
  /** Whether this host holds the profile's lock: only one host per profile serves its phones. */
  readonly holdsLock: boolean;
}

/** A remote the host may offer: its provider, and the profile its phones and switches are kept in. */
export interface RemoteHome {
  readonly offer: RemoteOffer;
  readonly profile: ProfileFolder;
}

/**
 * Where the host offers remote, or `undefined` when it offers none: without
 * a provider, over `--stdio`, without a profile folder, or while another
 * host holds the profile's lock. Says why when it was given a provider. A
 * probe runs only when the rest would let the host offer remote, so a
 * launch that can't offer it never runs `tailscale`.
 */
export async function remoteHomeFor(
  remote: RemoteOffer | RemoteProbe | undefined,
  serving: RemoteServing,
  log: (text: string) => void,
): Promise<RemoteHome | undefined> {
  if (remote === undefined) return undefined;
  const { overStdio, profile, holdsLock } = serving;
  let why: string;
  if (overStdio) why = "the remote gateway needs a port, and over --stdio the host listens on none";
  else if (profile === undefined) why = "there is no profile folder to keep paired phones in";
  else if (!holdsLock) why = "another agent host serves this profile's phones";
  else {
    const offer = typeof remote === "function" ? await remote() : remote;
    return offer === undefined ? undefined : { offer, profile };
  }
  log(`Remote isn't offered: ${why}.\n`);
  return undefined;
}

/** A remote the host offers, with where its key is kept and where it reports. */
export interface ServedRemoteHome extends RemoteHome {
  /** Where the host key is kept: the keychain when Studio answers for it, the profile's secrets file otherwise. */
  readonly secrets: SecretStore;
  /** Where a step nobody awaits reports its failure: the host's standard error. */
  readonly log: (text: string) => void;
}

/** What the host's remote is put together from, when it offers remote. */
export interface HostRemoteParts extends ServedRemoteHome {
  readonly ledger: RunLedger;
  readonly runs: RunTable;
  /** The ports the host listens on; the gateway's joins while it listens. */
  readonly ownPorts: Set<number>;
  /** What a paired phone's `msg-*` and `team-read` read; without it the gateway answers them `not-supported`. */
  readonly messaging?: PhoneMessaging | undefined;
}

/** The `RemoteControl` the host serves, and how to stop what it started. */
export interface HostRemote {
  readonly control: RemoteControl;
  /** Stops the gateway and the tunnel; the switches stay as the person left them. */
  close(): Promise<void>;
}

/**
 * The host's remote: with `parts`, the pairing desk, the paired phones, the
 * switches, the host key and the gateway behind Studio's `RemoteControl`,
 * with remote available. Without them, or when the profile's remote files
 * can't be read, remote is not offered (`agent-host.remote-not-offered`).
 */
export async function openHostRemote(parts: HostRemoteParts | undefined): Promise<HostRemote> {
  if (parts === undefined) return notOffered();
  try {
    return await offered(parts);
  } catch (error) {
    parts.log(`Remote isn't offered: its files couldn't be read: ${String(error)}\n`);
    return notOffered();
  }
}

function notOffered(): HostRemote {
  return { control: new RemoteNotOffered(systemTime), close: () => Promise.resolve() };
}

async function offered(parts: HostRemoteParts): Promise<HostRemote> {
  const { offer, log } = parts;
  const time = systemTime;
  const folder = join(parts.profile.root, "remote");
  const phones = await PairedPhones.open({
    file: privateFileAt(join(folder, "paired-phones.json")),
    time,
    log,
  });
  const settings = await RemoteSettings.open({
    file: privateFileAt(join(folder, "remote.json")),
    log,
  });
  // Decision 7, condition 1: the codes come only from the host's secure random source.
  const desk = new PairingDesk({
    time,
    randomBytes: (length) => new Uint8Array(randomBytes(length)),
  });
  const hostKey = sharedHostKey(parts.secrets);
  const hostName = hostname();
  const gateway = new RemoteGateway({
    ledger: parts.ledger,
    runs: parts.runs,
    access: async () => deskAccess({ desk, phones, hostKey: await hostKey(), hostName, log }),
    risky: settings,
    ownPorts: parts.ownPorts,
    log,
    ...(parts.messaging === undefined
      ? {}
      : { messaging: { view: parts.messaging, clock: systemClock } }),
    ...(offer.gatewayPort === undefined ? {} : { port: offer.gatewayPort }),
    ...(offer.tunnelHosts === undefined ? {} : { tunnelHosts: offer.tunnelHosts }),
    ...(offer.publicHeaders === undefined ? {} : { publicHeaders: offer.publicHeaders }),
  });
  const control = await HostRemoteControl.open({
    available: true,
    hostName,
    desk,
    phones,
    settings,
    hostKey,
    tunnel: offer.tunnel,
    gateway,
    time,
    log,
  });
  return { control, close: () => control.close() };
}
