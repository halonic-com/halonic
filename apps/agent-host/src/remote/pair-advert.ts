import { gatewayHostName } from "@halonicjs/ports";
import {
  type DnsQuestion,
  type DnsRecord,
  dnsTypes,
  readQuestions,
  writeResponse,
} from "./dns-message.ts";

/** The service a phone browses for on its Wi-Fi to list computers that are pairing. */
export const pairServiceName = "_halonic-pair._tcp.local";

/** Seconds a phone's cache keeps the records, RFC 6762's figure for records like these. */
const recordTtl = 120;
/** How long after the first announcement the second goes, as RFC 6762 section 8.3 asks. */
const announceGapMs = 1_000;

/** The datagram socket on the multicast DNS group, port 5353. */
export interface MulticastSocket {
  /** Sends one datagram to the group. */
  send(message: Uint8Array): Promise<void>;
  /** Calls `handler` with each datagram that arrives. */
  onMessage(handler: (message: Uint8Array) => void): void;
  close(): Promise<void>;
}

/** What one advertisement says: the computer's name, and where its gateway takes a phone. */
export interface PairAdvertisement {
  /** The name the computer gives itself; only this goes in the TXT record. */
  readonly hostName: string;
  /** The port of the gateway's LAN endpoint. */
  readonly port: number;
  /** The computer's IPv4 addresses on the LAN. */
  readonly addresses: readonly string[];
}

/** What a {@link PairAdvert} runs on. */
export interface PairAdvertOptions {
  /** Opens the multicast socket; rejects when port 5353 can't be had. */
  readonly open: () => Promise<MulticastSocket>;
  /** Resolves `ms` milliseconds from now. */
  readonly wait: (ms: number) => Promise<void>;
  /** Random bytes, for a name no other computer on the LAN has. */
  readonly randomBytes: (length: number) => Uint8Array;
  /** Where a failure nobody awaits is reported. */
  readonly log: (text: string) => void;
}

interface Running {
  readonly socket: MulticastSocket;
  readonly records: readonly DnsRecord[];
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
 * @example
 * await advert.start({ hostName: "Tim's laptop", port: 4100, addresses: ["192.168.1.20"] });
 * await advert.stop(); // says goodbye, so phones drop it at once
 */
export class PairAdvert {
  readonly #options: PairAdvertOptions;
  #running: Running | undefined;

  constructor(options: PairAdvertOptions) {
    this.#options = options;
  }

  /** Starts advertising, announcing twice a second apart; does nothing while it runs. */
  async start(advertisement: PairAdvertisement): Promise<void> {
    if (this.#running !== undefined) return;
    let socket: MulticastSocket;
    try {
      socket = await this.#options.open();
    } catch (error) {
      this.#options.log(`Phones on this Wi-Fi won't list this computer: ${String(error)}\n`);
      return;
    }
    const running: Running = { socket, records: this.#records(advertisement) };
    this.#running = running;
    socket.onMessage((message) => {
      const answer = answerFor(readQuestions(message), running.records);
      if (answer !== undefined) this.#send(running, answer);
    });
    this.#send(running, writeResponse(running.records));
    await this.#options.wait(announceGapMs);
    if (this.#running === running) this.#send(running, writeResponse(running.records));
  }

  /** Says goodbye (the records with no time to live) and closes the socket. */
  async stop(): Promise<void> {
    const running = this.#running;
    if (running === undefined) return;
    this.#running = undefined;
    try {
      await running.socket.send(
        writeResponse(running.records.map((record) => ({ ...record, ttl: 0 }))),
      );
    } finally {
      await running.socket.close();
    }
  }

  #send(running: Running, message: Uint8Array): void {
    running.socket.send(message).catch((error: unknown) => {
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
      ...advertisement.addresses.map(
        (address): DnsRecord => ({
          type: "A",
          name: target,
          ttl: recordTtl,
          unique: true,
          address,
        }),
      ),
    ];
  }
}

/**
 * The response to a query's questions, or `undefined` unless one is a PTR
 * question for {@link pairServiceName}: the host answers nothing else, not
 * even about its own instance. The PTR record is the answer and the others
 * go with it as additionals, so the phone needs no second query.
 */
function answerFor(questions: readonly DnsQuestion[], records: readonly DnsRecord[]) {
  const browsed = questions.some(
    (question) => question.name === pairServiceName && question.type === dnsTypes.PTR,
  );
  if (!browsed) return undefined;
  const isPointer = (record: DnsRecord) => record.type === "PTR";
  return writeResponse(
    records.filter(isPointer),
    records.filter((record) => !isPointer(record)),
  );
}
