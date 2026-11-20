import type {
  CodeEndReason,
  PairedPhone,
  PairingEndReason,
  PairingEvent,
  PairingSession,
  PhonePlatform,
  RemoteControl,
  RemoteState,
  TunnelReason,
  TunnelStatus,
} from "@halonicjs/ports";
import { FakeTunnelTime } from "./fake-tunnel-provider.ts";
import { Feed } from "./feed.ts";

/** What a {@link FakeRemoteControl} reports and how long its codes last. */
export interface FakeRemoteControlOptions {
  /** Whether the host offers remote. Defaults to `true`, so Studio's screens can be built on the fake. */
  available?: boolean;
  /** The name the computer gives itself. Defaults to "Test laptop". */
  hostName?: string;
  /** The tunnel provider's id. Defaults to "fake". */
  tunnelProviderId?: string;
  /** Where every time comes from. Defaults to a new {@link FakeTunnelTime}. */
  time?: FakeTunnelTime;
  /** How long a code works, in simulated milliseconds. Defaults to 5 minutes. */
  codeLifeMs?: number;
  /** How long Allow is waited for. Defaults to 2 minutes. */
  allowWaitMs?: number;
  /** How many wrong tries end a code. Defaults to 5. */
  triesPerCode?: number;
}

/** A phone as a test adds it, without the steps of a pairing. */
export interface FakePhone {
  name: string;
  platform?: PhonePlatform;
  pairedAt?: string;
  lastSeenAt?: string;
  connected?: boolean;
}

/** Codes the fake hands out in turn. They are not secret: a fake pairs nothing real. */
const sampleCodes = ["7KQ2M9XF4HTA", "XX7A9Q36KFB3", "C4DE8NPR2W6Y"];
const sampleCheckCodes = ["4F72KQ", "9MX3TA", "H7C2RW"];

interface Pairing {
  readonly session: FakePairingSession;
  readonly turnedOn: boolean;
  /** Which code the pairing shows, counted across the fake, so a timer of an older code does nothing. */
  code: number;
  /** Whether the code still works; `false` after `code-ended`, until `newCode`. */
  codeWorks: boolean;
  wrongTries: number;
  phone?: { name: string; platform: PhonePlatform };
}

/** What a pairing session asks of the fake that opened it. */
interface PairingOwner {
  decide(session: FakePairingSession, allow: boolean): void;
  newCode(session: FakePairingSession): void;
  close(session: FakePairingSession): void;
}

class FakePairingSession implements PairingSession {
  readonly seen: PairingEvent[] = [];
  private readonly readers = new Set<Feed<PairingEvent>>();
  private readonly control: PairingOwner;

  constructor(control: PairingOwner) {
    this.control = control;
  }

  get last(): PairingEvent | undefined {
    return this.seen.at(-1);
  }

  get over(): boolean {
    return this.last?.type === "paired" || this.last?.type === "ended";
  }

  events(): AsyncIterable<PairingEvent> {
    const feed = new Feed<PairingEvent>((left) => this.readers.delete(left));
    for (const event of this.seen) feed.push(event);
    if (this.over) feed.end();
    else this.readers.add(feed);
    return feed;
  }

  allow(): Promise<void> {
    return this.answer(true);
  }

  deny(): Promise<void> {
    return this.answer(false);
  }

  newCode(): Promise<void> {
    if (this.over) return Promise.reject(new Error("an ended pairing gives no new code"));
    this.control.newCode(this);
    return Promise.resolve();
  }

  close(): Promise<void> {
    if (!this.over) this.control.close(this);
    return Promise.resolve();
  }

  push(event: PairingEvent): void {
    this.seen.push(event);
    for (const reader of this.readers) reader.push(event);
    if (!this.over) return;
    for (const reader of this.readers) reader.end();
    this.readers.clear();
  }

  end(reason: PairingEndReason, tunnel?: TunnelStatus): void {
    if (reason !== "tunnel-down") {
      this.push({ type: "ended", reason });
      return;
    }
    const tunnelReason =
      tunnel !== undefined && "reason" in tunnel ? tunnel.reason : "provider-error";
    this.push({ type: "ended", reason, tunnelReason });
  }

  private answer(allow: boolean): Promise<void> {
    if (this.last?.type !== "check") {
      return Promise.reject(new Error("Allow and Don't allow wait for a phone's check code"));
    }
    this.control.decide(this, allow);
    return Promise.resolve();
  }
}

/**
 * A {@link RemoteControl} that lives in the process, so Studio's Remote
 * screens can be built and tested before the host's pairing service exists.
 * It follows the port to the letter, and `remoteControlContract` proves it.
 *
 * A code that stops working leaves its pairing open and remote on, so
 * `newCode` never restarts the tunnel.
 *
 * A test plays the phone and the tunnel from outside: `phoneUsesCode`,
 * `wrongTry`, `phoneConnects` and `phoneDisconnects`, `setTunnel`, and
 * `addPhone` for a list without pairing. Codes run out and Allow times out
 * in simulated time, which moves only when the test advances it.
 *
 * @example
 * const remote = new FakeRemoteControl();
 * const pairing = await remote.startPairing();
 * remote.phoneUsesCode({ name: "Pixel 8" });
 * await pairing.allow();
 */
export class FakeRemoteControl implements RemoteControl {
  private readonly time: FakeTunnelTime;
  private readonly hostName: string;
  private readonly codeLifeMs: number;
  private readonly allowWaitMs: number;
  private readonly triesPerCode: number;
  private current: RemoteState;
  private pairingNow: Pairing | undefined;
  private readonly readers = new Set<Feed<RemoteState>>();
  private codes = 0;
  private phonesAdded = 0;
  private failure: TunnelReason | undefined;

  constructor(options: FakeRemoteControlOptions = {}) {
    this.time = options.time ?? new FakeTunnelTime();
    this.hostName = options.hostName ?? "Test laptop";
    this.codeLifeMs = options.codeLifeMs ?? 5 * 60_000;
    this.allowWaitMs = options.allowWaitMs ?? 2 * 60_000;
    this.triesPerCode = options.triesPerCode ?? 5;
    this.current = {
      available: options.available ?? true,
      on: false,
      tunnelProviderId: options.tunnelProviderId ?? "fake",
      tunnel: this.stopped(),
      allowRiskyRemotely: false,
      phones: [],
      pairing: false,
    };
  }

  /** The current state, as the last snapshot `state` gave. */
  get snapshot(): RemoteState {
    return this.current;
  }

  state(): AsyncIterable<RemoteState> {
    const feed = new Feed<RemoteState>((left) => this.readers.delete(left));
    feed.push(this.current);
    this.readers.add(feed);
    return feed;
  }

  setRemote(on: boolean): Promise<void> {
    if (on && !this.current.available) {
      return Promise.reject(new Error("this host doesn't offer remote"));
    }
    if (on === this.current.on) return Promise.resolve();
    if (on) {
      const failure = this.failure;
      this.failure = undefined;
      const at = this.stamp();
      const tunnel: TunnelStatus =
        failure === undefined ? { state: "ready", at } : { state: "down", reason: failure, at };
      this.change({ on, tunnel });
      return Promise.resolve();
    }
    this.endPairing("remote-off");
    this.change({
      on,
      tunnel: this.stopped(),
      phones: this.current.phones.map((phone) => this.leave(phone)),
    });
    return Promise.resolve();
  }

  async startPairing(): Promise<PairingSession> {
    if (!this.current.available) throw new Error("this host doesn't offer remote");
    const session = new FakePairingSession({
      decide: (decided, allow) => this.decide(decided, allow),
      newCode: (asking) => {
        if (this.pairingNow?.session === asking) this.showCode(this.pairingNow);
      },
      close: (closed) => {
        if (this.pairingNow?.session === closed) this.endPairing("closed");
        else closed.end("closed");
      },
    });
    if (this.pairingNow !== undefined) {
      session.end("busy");
      return session;
    }
    const turnedOn = !this.current.on;
    await this.setRemote(true);
    const pairing: Pairing = { session, turnedOn, code: 0, codeWorks: false, wrongTries: 0 };
    this.pairingNow = pairing;
    this.change({ pairing: true });
    if (this.current.tunnel.state === "down") {
      this.endPairing("tunnel-down");
      return session;
    }
    this.showCode(pairing);
    return session;
  }

  revoke(phoneId: string): Promise<void> {
    const phones = this.current.phones.filter((phone) => phone.id !== phoneId);
    if (phones.length !== this.current.phones.length) this.change({ phones });
    return Promise.resolve();
  }

  revokeAll(): Promise<void> {
    if (this.current.phones.length > 0) this.change({ phones: [] });
    return Promise.resolve();
  }

  setAllowRiskyRemotely(allow: boolean): Promise<void> {
    if (allow !== this.current.allowRiskyRemotely) this.change({ allowRiskyRemotely: allow });
    return Promise.resolve();
  }

  /**
   * A phone used the open pairing's code: the pairing moves to `check`, and
   * Allow is waited for. Gives the check code.
   */
  phoneUsesCode(phone: { name: string; platform?: PhonePlatform }): string {
    const pairing = this.waitingPairing("use a code");
    const platform = phone.platform ?? "android";
    pairing.phone = { name: phone.name, platform };
    const checkCode = sampleCheckCodes[(pairing.code - 1) % sampleCheckCodes.length] as string;
    pairing.session.push({
      type: "check",
      checkCode,
      phoneName: phone.name,
      platform,
      allowBy: this.stamp(this.allowWaitMs),
    });
    const code = pairing.code;
    void this.time.wait(this.allowWaitMs).then(() => {
      if (this.isShowing(pairing, code) && pairing.phone !== undefined) {
        this.endCode(pairing, "allow-timed-out");
      }
    });
    return checkCode;
  }

  /** A phone tried a wrong code; the last allowed try ends the code. Gives the tries left. */
  wrongTry(): number {
    const pairing = this.waitingPairing("try a code");
    pairing.wrongTries += 1;
    const left = this.triesPerCode - pairing.wrongTries;
    if (left === 0) this.endCode(pairing, "too-many-tries");
    return left;
  }

  /** Adds a paired phone directly, as a store that already holds it would. */
  addPhone(phone: FakePhone): PairedPhone {
    const added = this.newPhone(phone.name, phone.platform ?? "android", phone);
    this.change({ phones: [...this.current.phones, added] });
    return added;
  }

  /** A paired phone opened a session. */
  phoneConnects(phoneId: string): void {
    this.updatePhone(phoneId, (phone) => ({ ...phone, connected: true }));
  }

  /** A paired phone's session ended: it is last seen now. */
  phoneDisconnects(phoneId: string): void {
    this.updatePhone(phoneId, (phone) => this.leave(phone));
  }

  /** Moves the tunnel while remote is on; `down` ends an open pairing with `tunnel-down`. */
  setTunnel(state: "starting" | "ready"): void;
  setTunnel(state: "degraded" | "down", reason: TunnelReason): void;
  setTunnel(state: TunnelStatus["state"], reason?: TunnelReason): void {
    if (!this.current.on) throw new Error("remote is off, so there is no tunnel to move");
    const at = this.stamp();
    const tunnel: TunnelStatus =
      state === "starting" || state === "ready"
        ? { state, at }
        : { state, reason: reason ?? "provider-error", at };
    this.change({ tunnel });
    if (state === "down") this.endPairing("tunnel-down");
  }

  /** Makes the next time remote turns on leave the tunnel `down` with `reason`, as when Tailscale isn't installed. */
  failNextStart(reason: TunnelReason): void {
    this.failure = reason;
  }

  /** Makes the host offer remote or not, as B8's switch-on gate will. */
  setAvailable(available: boolean): void {
    if (!available) void this.setRemote(false);
    this.change({ available });
  }

  private decide(session: FakePairingSession, allow: boolean): void {
    const pairing = this.pairingNow;
    if (pairing?.session !== session || pairing.phone === undefined) return;
    if (!allow) {
      this.endCode(pairing, "denied");
      return;
    }
    const phone = this.newPhone(pairing.phone.name, pairing.phone.platform, { connected: true });
    this.pairingNow = undefined;
    this.change({ phones: [...this.current.phones, phone], pairing: false });
    session.push({ type: "paired", phone });
  }

  private endPairing(reason: PairingEndReason): void {
    const pairing = this.pairingNow;
    if (pairing === undefined) return;
    this.pairingNow = undefined;
    this.change({ pairing: false });
    pairing.session.end(reason, this.current.tunnel);
    if (pairing.turnedOn && this.current.phones.length === 0 && reason !== "remote-off") {
      void this.setRemote(false);
    }
  }

  /** Gives the pairing a new code that works, dropping a phone that waited at `check`. */
  private showCode(pairing: Pairing): void {
    this.codes += 1;
    const code = this.codes;
    pairing.code = code;
    pairing.codeWorks = true;
    pairing.wrongTries = 0;
    delete pairing.phone;
    pairing.session.push({
      type: "code",
      code: sampleCodes[(code - 1) % sampleCodes.length] as string,
      qr: `halonic-pair:fake-${code}`,
      hostName: this.hostName,
      expiresAt: this.stamp(this.codeLifeMs),
    });
    void this.time.wait(this.codeLifeMs).then(() => {
      if (this.isShowing(pairing, code) && pairing.phone === undefined) {
        this.endCode(pairing, "code-expired");
      }
    });
  }

  /** The code stops working; the pairing stays open, and remote stays on. */
  private endCode(pairing: Pairing, reason: CodeEndReason): void {
    pairing.codeWorks = false;
    delete pairing.phone;
    pairing.session.push({ type: "code-ended", reason });
  }

  /** Whether the pairing is still open and still shows that code, working. */
  private isShowing(pairing: Pairing, code: number): boolean {
    return this.pairingNow === pairing && pairing.code === code && pairing.codeWorks;
  }

  private waitingPairing(action: string): Pairing {
    const pairing = this.pairingNow;
    if (pairing === undefined || !pairing.codeWorks || pairing.phone !== undefined) {
      throw new Error(`no pairing is waiting for a phone to ${action}`);
    }
    return pairing;
  }

  private newPhone(
    name: string,
    platform: PhonePlatform,
    phone: Omit<FakePhone, "name" | "platform">,
  ): PairedPhone {
    this.phonesAdded += 1;
    return {
      id: `phone-${this.phonesAdded}`,
      name: this.freeName(name),
      platform,
      pairedAt: phone.pairedAt ?? this.stamp(),
      ...(phone.lastSeenAt === undefined ? {} : { lastSeenAt: phone.lastSeenAt }),
      connected: phone.connected ?? false,
    };
  }

  /** The name, or the name with " (2)", " (3)" and so on when a paired phone has it. */
  private freeName(name: string): string {
    const taken = new Set(this.current.phones.map((phone) => phone.name));
    let free = name;
    for (let count = 2; taken.has(free); count += 1) free = `${name} (${count})`;
    return free;
  }

  private updatePhone(phoneId: string, update: (phone: PairedPhone) => PairedPhone): void {
    if (!this.current.phones.some((phone) => phone.id === phoneId)) {
      throw new Error(`no paired phone has the id ${phoneId}`);
    }
    this.change({
      phones: this.current.phones.map((phone) => (phone.id === phoneId ? update(phone) : phone)),
    });
  }

  private leave(phone: PairedPhone): PairedPhone {
    return phone.connected ? { ...phone, connected: false, lastSeenAt: this.stamp() } : phone;
  }

  private change(changes: Partial<RemoteState>): void {
    this.current = { ...this.current, ...changes };
    for (const reader of this.readers) reader.push(this.current);
  }

  private stopped(): TunnelStatus {
    return { state: "down", reason: "stopped", at: this.stamp() };
  }

  private stamp(laterMs = 0): string {
    return new Date(this.time.now().getTime() + laterMs).toISOString();
  }
}
