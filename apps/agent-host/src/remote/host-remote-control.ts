import {
  assertGatewayTunnelConfig,
  type CodeEndReason,
  encodePairingQr,
  type PairedPhone,
  type PairingEndReason,
  type PairingSession,
  type RemoteControl,
  type RemoteState,
  type TunnelEndpoint,
  type TunnelProvider,
  type TunnelReason,
  type TunnelStatus,
} from "@halonicjs/ports";
import { AsyncFeed, assertDefined } from "@halonicjs/std";
import type { HostKey } from "./host-key.ts";
import { HostPairingSession } from "./host-pairing-session.ts";
import type { LanInterface } from "./lan-interface.ts";
import type { PairAdvert } from "./pair-advert.ts";
import type { PairedPhones } from "./paired-phones.ts";
import type { PairingDesk } from "./pairing-desk.ts";
import type { DeskEndReason, OpenPairing, PairingWatcher } from "./pairing-types.ts";
import type { RemoteSettings } from "./remote-settings.ts";
import type { RemoteTime } from "./remote-time.ts";

/** The gateway's endpoint on the Wi-Fi, which a phone tries first, and the advert that lists it. */
export interface RemoteLanEndpoint {
  /** The interface the gateway's LAN listener is on. */
  readonly lan: LanInterface;
  readonly port: number;
  readonly advert: PairAdvert;
}

/** What a {@link HostRemoteControl} puts together. */
export interface HostRemoteControlOptions {
  /** Whether the host offers remote; `false` until B8 turns it on. */
  readonly available: boolean;
  /** The name the computer gives itself in the dialog and the QR code. */
  readonly hostName: string;
  readonly desk: PairingDesk;
  readonly phones: PairedPhones;
  readonly settings: RemoteSettings;
  readonly hostKey: () => Promise<HostKey>;
  readonly tunnel: TunnelProvider;
  /** The port of the remote gateway's loopback listener: the only thing the tunnel may point at. */
  readonly gatewayPort: number;
  /** The gateway's LAN endpoint, when it listens on the Wi-Fi. */
  readonly lanEndpoint?: RemoteLanEndpoint;
  readonly time: RemoteTime;
  /** Where a failure nobody awaits is reported. */
  readonly log: (text: string) => void;
}

/** The code a pairing shows, with the desk's pairing behind it. */
interface ShownCode {
  desk: OpenPairing | undefined;
  /** The host ended it itself (a new code, the dialog closed, remote off), so its end says nothing more. */
  closedByHost: boolean;
}

/** One open Pair a phone dialog: one session, however many codes it shows. */
interface Pairing {
  readonly session: HostPairingSession;
  /** Whether this pairing turned remote on, so it turns it off again if it ends without a phone. */
  readonly turnedOn: boolean;
  /** The code that still works; `undefined` after `code-ended`, until `newCode`. */
  code: ShownCode | undefined;
  /** The parts of the QR code every code of this pairing shares. */
  qr: { readonly hostKey: Uint8Array; readonly endpoints: readonly string[] } | undefined;
  /** Allow was pressed and the phone is being kept: Allow's outcome stands. */
  allowing: boolean;
  /** The phone Allow kept. */
  phone: PairedPhone | undefined;
}

/**
 * The host's `RemoteControl` (requirement `agent-host.remote-control`): the
 * pairing desk, the paired phones, the remote switches, the host key, the
 * tunnel and the mDNS advert put together, as Studio drives them. Each Pair
 * a phone dialog is one pairing session; a code that stops working leaves
 * it open, and a new code is a new pairing at the desk, so the tunnel never
 * restarts for one. The phone hears `denied` when the person ends a code
 * (Don't allow, a new code, closing, remote off) and `timed-out` when time
 * ran out or it left.
 *
 * @example
 * const remote = await HostRemoteControl.open({ available, hostName, desk, phones, settings, hostKey, tunnel, gatewayPort, time, log });
 * const pairing = await remote.startPairing();
 */
export class HostRemoteControl implements RemoteControl {
  readonly #options: HostRemoteControlOptions;
  readonly #providerId: string;
  readonly #readers = new Set<AsyncFeed<RemoteState>>();
  #tunnelStatus: TunnelStatus;
  /** The tunnel's endpoint, once it came up; `undefined` while remote is off or when it went down. */
  #endpoint: Promise<TunnelEndpoint | undefined> = Promise.resolve(undefined);
  /** Counts the times remote turned on, so a status of an earlier tunnel changes nothing. */
  #tunnelRun = 0;
  #pairing: Pairing | undefined;

  private constructor(options: HostRemoteControlOptions, providerId: string) {
    this.#options = options;
    this.#providerId = providerId;
    this.#tunnelStatus = this.#stopped();
    options.phones.onChange(() => this.#publish());
  }

  /** Puts the parts together, and opens the tunnel again when the person left remote on. */
  static async open(options: HostRemoteControlOptions): Promise<HostRemoteControl> {
    const { id } = await options.tunnel.capabilities();
    const control = new HostRemoteControl(options, id);
    if (options.available && options.settings.values.on) await control.#turnOn();
    return control;
  }

  state(): AsyncIterable<RemoteState> {
    const feed = new AsyncFeed<RemoteState>((left) => this.#readers.delete(left));
    feed.push(this.#snapshot());
    this.#readers.add(feed);
    return feed;
  }

  async setRemote(on: boolean): Promise<void> {
    if (!on) return this.#turnOff();
    this.#requireAvailable();
    if (!this.#options.settings.values.on) await this.#turnOn();
  }

  async startPairing(): Promise<PairingSession> {
    this.#requireAvailable();
    const session = new HostPairingSession({
      decide: (asking, allow) => this.#decide(asking, allow),
      newCode: async (asking) => this.#showCode(this.#pairingOf(asking)),
      close: async (closing) => {
        if (this.#pairing?.session === closing && !this.#pairing.allowing) {
          await this.#endPairing("closed");
        }
      },
    });
    if (this.#pairing !== undefined) {
      session.end("busy");
      return session;
    }
    const turnedOn = !this.#options.settings.values.on;
    const pairing: Pairing = {
      session,
      turnedOn,
      code: undefined,
      qr: undefined,
      allowing: false,
      phone: undefined,
    };
    this.#pairing = pairing;
    this.#publish();
    try {
      if (turnedOn) await this.#turnOn();
      const [endpoint, hostKey] = await Promise.all([this.#endpoint, this.#options.hostKey()]);
      if (this.#pairing === pairing) this.#begin(pairing, endpoint, hostKey);
    } catch (error) {
      await this.#endPairing("closed");
      throw error;
    }
    return session;
  }

  revoke(phoneId: string): Promise<void> {
    return this.#options.phones.revoke(phoneId);
  }

  revokeAll(): Promise<void> {
    return this.#options.phones.revokeAll();
  }

  async setAllowRiskyRemotely(allow: boolean): Promise<void> {
    const changed = this.#options.settings.change({ allowRiskyRemotely: allow });
    this.#publish();
    await changed;
  }

  /** Shows the first code once the tunnel is up, or ends the pairing when it isn't. */
  #begin(pairing: Pairing, endpoint: TunnelEndpoint | undefined, hostKey: HostKey): void {
    if (endpoint === undefined) {
      // A tunnel that went down before the pairing opened ends it here; one
      // whose status hasn't come yet ends it in the tunnel's watch.
      if (isDown(this.#tunnelStatus)) this.#background(this.#endPairing("tunnel-down"));
      return;
    }
    const lan = this.#options.lanEndpoint;
    const lanUrl = lan === undefined ? [] : [`tcp://${lan.lan.address}:${lan.port}`];
    pairing.qr = { hostKey: hostKey.publicKey, endpoints: [...lanUrl, endpoint.url] };
    if (lan !== undefined) {
      const advertisement = { hostName: this.#options.hostName, port: lan.port, lan: lan.lan };
      this.#background(lan.advert.start(advertisement));
    }
    this.#showCode(pairing);
  }

  /** Ends the code still shown, refusing a phone at `check`, and shows a new one. */
  #showCode(pairing: Pairing): void {
    this.#closeCode(pairing);
    const code: ShownCode = { desk: undefined, closedByHost: false };
    const desk = this.#options.desk.open(this.#watcherFor(pairing, code));
    if (desk === undefined) throw new Error("A phone's Allow is still being saved.");
    code.desk = desk;
    pairing.code = code;
    const { hostName } = this.#options;
    const { hostKey, endpoints } = assertDefined(pairing.qr, "the pairing's QR parts");
    let qr: string;
    try {
      qr = encodePairingQr({ hostKey, code: desk.code, hostName, endpoints }).text;
    } catch (error) {
      this.#options.log(`The tunnel's address doesn't fit a pairing QR code: ${String(error)}\n`);
      this.#background(this.#endPairing("tunnel-down", "provider-error"));
      return;
    }
    const expiresAt = desk.expiresAt.toISOString();
    pairing.session.push({ type: "code", code: desk.code, qr, hostName, expiresAt });
  }

  /** What the dialog hears of one code at the desk, while it is the code shown. */
  #watcherFor(pairing: Pairing, code: ShownCode): PairingWatcher {
    const shown = () => this.#pairing === pairing && pairing.code === code && !code.closedByHost;
    return {
      check: ({ checkCode, phone, allowBy }) => {
        if (!shown()) return;
        const { name: phoneName, platform } = phone;
        const check = { checkCode, phoneName, platform, allowBy: allowBy.toISOString() };
        pairing.session.push({ type: "check", ...check });
      },
      paired: async (phone) => {
        pairing.phone = await this.#options.phones.add(phone);
      },
      ended: (reason) => {
        if (!shown()) return;
        pairing.code = undefined;
        // The desk closes a pairing on its own only when keeping the phone failed.
        if (reason === "closed") this.#background(this.#endPairing("closed"));
        else pairing.session.push({ type: "code-ended", reason: codeEndReason(reason) });
      },
    };
  }

  async #decide(session: HostPairingSession, allow: boolean): Promise<void> {
    const pairing = this.#pairingOf(session);
    const desk = pairing.code?.desk;
    if (desk === undefined) throw new Error("No phone waits for an answer.");
    if (!allow) {
      desk.deny();
      return;
    }
    pairing.allowing = true;
    await desk.allow();
    // Remote may have been turned off while the phone was kept; the phone stays paired.
    if (this.#pairing === pairing) this.#pairing = undefined;
    this.#stopAdvert();
    this.#publish();
    session.push({ type: "paired", phone: assertDefined(pairing.phone, "the phone Allow kept") });
  }

  async #endPairing(reason: PairingEndReason, tunnelReason?: TunnelReason): Promise<void> {
    const pairing = this.#pairing;
    if (pairing === undefined) return;
    this.#pairing = undefined;
    this.#closeCode(pairing);
    this.#stopAdvert();
    pairing.session.end(reason, tunnelReason ?? reasonOf(this.#tunnelStatus));
    this.#publish();
    // Only this pairing's own phone keeps remote on; phones paired before don't.
    const pairedNothing = pairing.phone === undefined;
    if (pairing.turnedOn && reason !== "remote-off" && pairedNothing) await this.#turnOff();
  }

  /** Ends the code shown at the desk, if any, without a `code-ended`; a phone at `check` hears `denied`. */
  #closeCode(pairing: Pairing): void {
    const code = pairing.code;
    pairing.code = undefined;
    if (code === undefined) return;
    code.closedByHost = true;
    code.desk?.close();
  }

  async #turnOn(): Promise<void> {
    const { gatewayPort, settings, tunnel } = this.#options;
    const config = { gateway: { host: "127.0.0.1" as const, port: gatewayPort } };
    assertGatewayTunnelConfig(config, gatewayPort);
    this.#tunnelRun += 1;
    this.#background(this.#watchTunnel(this.#tunnelRun));
    // A start that fails says why on the status stream, which the watch shows.
    this.#endpoint = tunnel.start(config).catch(() => undefined);
    const changed = settings.change({ on: true });
    this.#publish();
    await changed;
  }

  async #turnOff(): Promise<void> {
    await this.#endPairing("remote-off");
    if (!this.#options.settings.values.on) return;
    this.#tunnelRun += 1;
    this.#endpoint = Promise.resolve(undefined);
    this.#tunnelStatus = this.#stopped();
    const changed = this.#options.settings.change({ on: false });
    this.#publish();
    await Promise.all([changed, this.#options.tunnel.stop()]);
  }

  /** Shows each status of the tunnel of `run`; one that goes down ends an open pairing. */
  async #watchTunnel(run: number): Promise<void> {
    for await (const status of this.#options.tunnel.status()) {
      if (run !== this.#tunnelRun) return;
      this.#tunnelStatus = status;
      this.#publish();
      if (isDown(status)) await this.#endPairing("tunnel-down");
    }
  }

  #stopAdvert(): void {
    const advert = this.#options.lanEndpoint?.advert;
    if (advert !== undefined) this.#background(advert.stop());
  }

  #pairingOf(session: HostPairingSession): Pairing {
    const pairing = this.#pairing;
    if (pairing?.session !== session) throw new Error("This pairing has ended.");
    return pairing;
  }

  #requireAvailable(): void {
    if (!this.#options.available) throw new Error("This host doesn't offer remote.");
  }

  #snapshot(): RemoteState {
    const { available, phones, settings } = this.#options;
    return {
      available,
      on: available && settings.values.on,
      tunnelProviderId: this.#providerId,
      tunnel: this.#tunnelStatus,
      allowRiskyRemotely: settings.values.allowRiskyRemotely,
      phones: phones.phones,
      pairing: this.#pairing !== undefined,
    };
  }

  #publish(): void {
    const state = this.#snapshot();
    for (const reader of this.#readers) reader.push(state);
  }

  #stopped(): TunnelStatus {
    return { state: "down", reason: "stopped", at: this.#options.time.now().toISOString() };
  }

  /** Runs work nobody awaits, and says why when it fails. */
  #background(work: Promise<unknown>): void {
    work.catch((error: unknown) => {
      this.#options.log(`Remote couldn't finish a step: ${String(error)}\n`);
    });
  }
}

/** Whether the tunnel went down on its own, rather than stopped. */
function isDown(status: TunnelStatus): boolean {
  return status.state === "down" && status.reason !== "stopped";
}

function reasonOf(status: TunnelStatus): TunnelReason {
  return "reason" in status ? status.reason : "provider-error";
}

/** The dialog's reason for a code the desk ended; the phone leaving shows as time running out. */
function codeEndReason(reason: Exclude<DeskEndReason, "closed">): CodeEndReason {
  return reason === "phone-left" ? "allow-timed-out" : reason;
}
