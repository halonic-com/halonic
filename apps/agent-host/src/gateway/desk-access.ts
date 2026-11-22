import type {
  ConnectedPhone,
  GatewayPairing,
  GatewayPhones,
  PairingAnswer,
  PairingAttempt,
  PairingPhone,
  PairingRefusal,
  PairingStart,
} from "@halonicjs/adapter-remote-gateway";
import type { HostKey } from "../remote/host-key.ts";
import type { PairedPhones } from "../remote/paired-phones.ts";
import type { PairingDesk, PairingTicket } from "../remote/pairing-desk.ts";
import type { PairingVerdict } from "../remote/pairing-types.ts";
import { deviceId } from "../remote/phone-records.ts";

/*
 * The gateway's view of the host's pairing desk and paired phones
 * (requirement `agent-host.remote-gateway-access`). The rules about codes,
 * tries, Allow and revoking stay in the desk and the store; this only
 * translates between the gateway's words and theirs.
 */

/** What the gateway is started with to take pairings and know its phones. */
export interface GatewayAccess {
  readonly pairing: GatewayPairing;
  readonly phones: GatewayPhones;
}

/** What {@link deskAccess} puts together. */
export interface DeskAccessOptions {
  readonly desk: PairingDesk;
  readonly phones: PairedPhones;
  /** The host's static key, already loaded: the gateway asks for it without waiting. */
  readonly hostKey: HostKey;
  /** The name the computer gives itself in the Pair a phone dialog and the QR code. */
  readonly hostName: string;
  /** Where a failure nobody awaits, saving a phone's last seen, is reported. */
  readonly log: (text: string) => void;
}

/**
 * The gateway's access through the host's own pairing desk and paired phones.
 *
 * @example
 * const access = deskAccess({ desk, phones, hostKey: await hostKey(), hostName, log });
 * new RemoteGateway(gatewaySettings, ledger, runs, settings, access);
 */
export function deskAccess(options: DeskAccessOptions): GatewayAccess {
  return { pairing: new DeskPairing(options.desk), phones: new StorePhones(options) };
}

/** The pairing desk as the gateway's pairing service: one ticket for each pairing message 1. */
export class DeskPairing implements GatewayPairing {
  readonly #desk: PairingDesk;

  constructor(desk: PairingDesk) {
    this.#desk = desk;
  }

  begin(): PairingStart {
    const admission = this.#desk.admit();
    if (!admission.admitted) return { kind: "refused", refusal: admission.refusal };
    const { ticket } = admission;
    return { kind: "open", code: ticket.code, attempt: new TicketAttempt(ticket) };
  }
}

/**
 * One handshake's report to its desk ticket. The ticket counts a try at
 * most once, and only `wrongTry` and the phone leaving count one: the
 * gateway reports a handshake that closes after message 2 as `wrongTry`, so
 * `close` here is only ever the phone leaving while Allow is awaited.
 */
class TicketAttempt implements PairingAttempt {
  readonly #ticket: PairingTicket;

  constructor(ticket: PairingTicket) {
    this.#ticket = ticket;
  }

  /** Message 1 couldn't be read, so nothing about the code was tried: the ticket isn't told. */
  drop(): void {}

  wrongTry(): PairingRefusal {
    return this.#ticket.wrongTry();
  }

  async decrypted(phone: PairingPhone, signal: AbortSignal): Promise<PairingAnswer> {
    const { publicKey, name, platform, checkCode } = phone;
    const use = this.#ticket.useCode({ publicKey, name, platform }, checkCode);
    if (!use.used) return { kind: "refused", refusal: use.refusal };
    const phoneLeft = () => this.#ticket.close();
    if (signal.aborted) phoneLeft();
    else signal.addEventListener("abort", phoneLeft, { once: true });
    try {
      return answerOf(await use.verdict);
    } finally {
      signal.removeEventListener("abort", phoneLeft);
    }
  }
}

function answerOf(verdict: PairingVerdict): PairingAnswer {
  return verdict.allowed ? { kind: "allowed" } : { kind: verdict.reason };
}

/** The paired phones and the host's key and name, as the gateway asks for them. */
export class StorePhones implements GatewayPhones {
  readonly #phones: PairedPhones;
  readonly #hostKey: HostKey;
  readonly #hostName: string;
  readonly #log: (text: string) => void;

  constructor(options: Omit<DeskAccessOptions, "desk">) {
    this.#phones = options.phones;
    this.#hostKey = options.hostKey;
    this.#hostName = options.hostName;
    this.#log = options.log;
  }

  hostPrivateKey(): Uint8Array {
    return this.#hostKey.privateKey();
  }

  hostName(): string {
    return this.#hostName;
  }

  isPaired(publicKey: Uint8Array): boolean {
    return this.#phones.find(publicKey) !== undefined;
  }

  /**
   * Opens the phone's session in the store, which cuts it on a revoke.
   *
   * @throws Error when the phone isn't paired (any more): a revoke landed after `isPaired`
   */
  connected(publicKey: Uint8Array, onRevoked: () => void): ConnectedPhone {
    const session = this.#phones.connect(deviceId(publicKey), onRevoked);
    return {
      end: () => {
        session.end().catch((error: unknown) => {
          this.#log(`A paired phone's last seen couldn't be saved: ${String(error)}\n`);
        });
      },
    };
  }
}
