import { gatewayHostName } from "@halonicjs/ports";
import {
  type DnsQuestion,
  type DnsRecord,
  dnsTypes,
  readQuestions,
  writeResponse,
} from "./dns-message.ts";
import { type LanInterface, onSubnet, type Subnet, subnetOf } from "./lan-interface.ts";

/** The service a phone browses for on its Wi-Fi to list computers that are pairing. */
export const pairServiceName = "_halonic-pair._tcp.local";

/** Seconds a phone's cache keeps the records, RFC 6762's figure for records like these. */
const recordTtl = 120;
/** How long after the first announcement the second goes, as RFC 6762 section 8.3 asks. */
const announceGapMs = 1_000;
/** The least time between two multicasts of the answer, announcements included (RFC 6762 section 6). */
const answerGapMs = 1_000;

/** The datagram socket on the multicast DNS group, port 5353, on one interface. */
export interface MulticastSocket {
  /** Sends one datagram to the group. */
  send(message: Uint8Array): Promise<void>;
  /** Calls `handler` with each datagram that arrives, and the address it came from. */
  onMessage(handler: (message: Uint8Array, from: string) => void): void;
  close(): Promise<void>;
}

/** What one advertisement says: the computer's name, and where its gateway takes a phone. */
export interface PairAdvertisement {
  /** The name the computer gives itself; only this goes in the TXT record. */
  readonly hostName: string;
  /** The port of the gateway's LAN endpoint. */
  readonly port: number;
  /** The interface the phone shares, the one the gateway's LAN endpoint is on: the only one advertised on. */
  readonly lan: LanInterface;
}

/** What a {@link PairAdvert} runs on. */
export interface PairAdvertOptions {
  /** Opens the multicast socket on the interface; rejects when port 5353 can't be had. */
  readonly open: (lan: LanInterface) => Promise<MulticastSocket>;
  /** The time in milliseconds, for the limit of one answer a second. */
  readonly now: () => number;
  /** Resolves `ms` milliseconds from now. */
  readonly wait: (ms: number) => Promise<void>;
  /** Random bytes, for a name no other computer on the LAN has. */
  readonly randomBytes: (length: number) => Uint8Array;
  /** Where a failure nobody awaits is reported. */
  readonly log: (text: string) => void;
}

/**
 * Every datagram an advertisement sends, written before its socket opens,
 * so nothing a query holds reaches what goes out, and a record that can't be
 * written stops the advertisement before it listens.
 */
interface AdvertMessages {
  /** Every record as an answer, sent when the advertising starts. */
  readonly announcement: Uint8Array;
  /** The PTR record as the answer, the others as additionals, for a phone's query. */
  readonly answer: Uint8Array;
  /** Every record with no time to live, sent when the advertising stops. */
  readonly goodbye: Uint8Array;
}

/** One advertisement, from `start` until `stop`. */
interface Run {
  readonly messages: AdvertMessages;
  /** The interface's subnet: a query from anywhere else is dropped. */
  readonly subnet: Subnet;
  /** The socket, once open; `undefined` when it couldn't open. */
  readonly socket: Promise<MulticastSocket | undefined>;
  /** `stop` was called: nothing more goes out, and `stop` closes the socket. */
  stopped: boolean;
  /** Whether an announcement went out, so phones need a goodbye. */
  announced: boolean;
  /** When the answer or an announcement last went out. */
  lastSentAt: number;
}

/**
 * Advertises `_halonic-pair._tcp` over multicast DNS while a pairing is
 * open, and only then (requirement `agent-host.remote-pair-advert`, build
 * plan decision 17), so the computer is invisible on the network the rest of
 * the time. The TXT record holds the host's name only: no key and no code.
 *
 * The instance and its target get a random name, `halonic-<16 hex>`, so
 * they can't clash with the computer's own `.local` name or another
 * computer's, and the advertisement skips RFC 6762's probing. A socket that
 * can't open is reported and pairing goes on: the phone can still type the
 * computer's address.
 *
 * It listens and sends on one interface only, the one the phone shares, and
 * drops a query from an address that isn't on that interface's subnet
 * (RFC 6762 section 11), so a VPN, a container bridge or a router can't
 * reach it. `start` and `stop` may come in any order: after `stop`
 * resolves, no socket of this advertisement is open, and a `start` that
 * follows a `stop` opens its socket only once the old one is closed, so at
 * most one is ever bound.
 *
 * @example
 * const lan = { address: "192.168.1.20", netmask: "255.255.255.0" };
 * await advert.start({ hostName: "Tim's laptop", port: 4100, lan });
 * await advert.stop(); // says goodbye, so phones drop it at once
 */
export class PairAdvert {
  readonly #options: PairAdvertOptions;
  #run: Run | undefined;
  /** A `stop`'s closing of its socket while it lasts, which the next socket waits for. */
  #closing: Promise<void> | undefined;

  constructor(options: PairAdvertOptions) {
    this.#options = options;
  }

  /**
   * Starts advertising, announcing twice a second apart; does nothing while
   * it runs. A socket that can't open still leaves the advertisement
   * running, without a socket, until `stop`: a pairing is one try, and the
   * next pairing tries again.
   */
  async start(advertisement: PairAdvertisement): Promise<void> {
    if (this.#run !== undefined) return;
    let messages: AdvertMessages;
    let subnet: Subnet;
    try {
      subnet = subnetOf(advertisement.lan);
      messages = writeMessages(this.#records(advertisement));
    } catch (error) {
      this.#options.log(`Phones on this Wi-Fi won't list this computer: ${String(error)}\n`);
      return;
    }
    const run: Run = {
      messages,
      subnet,
      socket: this.#openAfterClosing(advertisement.lan),
      stopped: false,
      announced: false,
      lastSentAt: Number.NEGATIVE_INFINITY,
    };
    this.#run = run;
    const socket = await run.socket;
    // A stop while the socket opened closes it; this run sends nothing.
    if (socket === undefined || run.stopped) return;
    socket.onMessage((message, from) => {
      // A second guard: the handler runs in the socket's event, where a throw would stop the host.
      try {
        this.#answer(run, socket, message, from);
      } catch (error) {
        this.#options.log(`A query from a phone on this Wi-Fi wasn't answered: ${String(error)}\n`);
      }
    });
    this.#send(run, socket, messages.announcement);
    run.announced = true;
    await this.#options.wait(announceGapMs);
    if (!run.stopped) this.#send(run, socket, messages.announcement);
  }

  /**
   * Says goodbye (the records with no time to live) when it announced, and
   * closes the socket, waiting for one still opening.
   */
  async stop(): Promise<void> {
    const run = this.#run;
    if (run === undefined) return;
    this.#run = undefined;
    run.stopped = true;
    const closed = this.#close(run);
    const closing = closed
      .catch(() => undefined)
      .finally(() => {
        if (this.#closing === closing) this.#closing = undefined;
      });
    this.#closing = closing;
    await closed;
  }

  /** Opens the socket at once, or once the socket a `stop` is closing is closed. */
  #openAfterClosing(lan: LanInterface): Promise<MulticastSocket | undefined> {
    const closing = this.#closing;
    return closing === undefined ? this.#open(lan) : closing.then(() => this.#open(lan));
  }

  /** Says goodbye on the run's socket when it announced, then closes it. */
  async #close(run: Run): Promise<void> {
    const socket = await run.socket;
    if (socket === undefined) return;
    try {
      if (run.announced) await socket.send(run.messages.goodbye);
    } finally {
      await socket.close();
    }
  }

  /** Opens the socket, or says why it couldn't and gives `undefined`. */
  async #open(lan: LanInterface): Promise<MulticastSocket | undefined> {
    try {
      return await this.#options.open(lan);
    } catch (error) {
      this.#options.log(`Phones on this Wi-Fi won't list this computer: ${String(error)}\n`);
      return undefined;
    }
  }

  /**
   * Sends the answer when `message`, from an address on the interface's
   * subnet, asks for the pairing service, at most
   * once a second however many ask, so a flood of queries on the Wi-Fi
   * can't make the host flood the group.
   */
  #answer(run: Run, socket: MulticastSocket, message: Uint8Array, from: string): void {
    if (run.stopped || !onSubnet(run.subnet, from)) return;
    if (!asksForPairService(readQuestions(message))) return;
    if (this.#options.now() - run.lastSentAt < answerGapMs) return;
    this.#send(run, socket, run.messages.answer);
  }

  #send(run: Run, socket: MulticastSocket, message: Uint8Array): void {
    run.lastSentAt = this.#options.now();
    socket.send(message).catch((error: unknown) => {
      this.#options.log(
        `An advertisement for phones on this Wi-Fi wasn't sent: ${String(error)}\n`,
      );
    });
  }

  #records(advertisement: PairAdvertisement): DnsRecord[] {
    const label = `halonic-${Buffer.from(this.#options.randomBytes(8)).toString("hex")}`;
    const instance = `${label}.${pairServiceName}`;
    const target = `${label}.local`;
    return [
      { type: "PTR", name: pairServiceName, ttl: recordTtl, unique: false, target: instance },
      {
        type: "SRV",
        name: instance,
        ttl: recordTtl,
        unique: true,
        port: advertisement.port,
        target,
      },
      {
        type: "TXT",
        name: instance,
        ttl: recordTtl,
        unique: true,
        entries: [`name=${gatewayHostName(advertisement.hostName)}`],
      },
      { type: "A", name: target, ttl: recordTtl, unique: true, address: advertisement.lan.address },
    ];
  }
}

/**
 * Writes every datagram of an advertisement of `records`.
 *
 * @throws RangeError when a record can't be written, such as an address that isn't IPv4
 */
function writeMessages(records: readonly DnsRecord[]): AdvertMessages {
  const isPointer = (record: DnsRecord) => record.type === "PTR";
  return {
    announcement: writeResponse(records),
    answer: writeResponse(
      records.filter(isPointer),
      records.filter((record) => !isPointer(record)),
    ),
    goodbye: writeResponse(records.map((record) => ({ ...record, ttl: 0 }))),
  };
}

/**
 * Whether one of a query's questions is a PTR question for
 * {@link pairServiceName}: the host answers nothing else, not even about its
 * own instance.
 */
function asksForPairService(questions: readonly DnsQuestion[]): boolean {
  return questions.some(
    (question) => question.name === pairServiceName && question.type === dnsTypes.PTR,
  );
}
