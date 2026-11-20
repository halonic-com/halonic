import { newPairingCode, pairingRules } from "@halonicjs/ports";
import { FailedTries } from "./failed-tries.ts";
import type {
  DeskEndReason,
  OpenPairing,
  PairingPhone,
  PairingVerdict,
  PairingWatcher,
  PairRefusal,
} from "./pairing-types.ts";
import type { RemoteTime } from "./remote-time.ts";

/** What the gateway gets for pairing message 1: a ticket for the handshake, or a refusal. */
export type PairingAdmission =
  | { readonly admitted: true; readonly ticket: PairingTicket }
  | { readonly admitted: false; readonly refusal: PairRefusal };

/** What the gateway gets once a phone's message 3 decrypted and its commitment matched. */
export type CodeUse =
  | { readonly used: true; readonly verdict: Promise<PairingVerdict> }
  | { readonly used: false; readonly refusal: PairRefusal };

type Stage =
  | { readonly kind: "waiting" }
  | { readonly kind: "check"; readonly ticket: PairingTicket; readonly phone: PairingPhone }
  | { readonly kind: "allowing" }
  | { readonly kind: "over" };

/** What a pairing shares with the desk that opened it. */
interface PairingRoom {
  readonly time: RemoteTime;
  readonly failed: FailedTries;
  /** The pairing ended, so another may open. */
  left(pairing: Pairing): void;
}

/** The state of one open pairing, which the desk and its tickets share. */
class Pairing implements OpenPairing {
  readonly code: string;
  readonly expiresAt: Date;
  stage: Stage = { kind: "waiting" };
  #wrongTries = 0;
  readonly #room: PairingRoom;
  readonly #watcher: PairingWatcher;
  #settle: ((verdict: PairingVerdict) => void) | undefined;

  constructor(room: PairingRoom, watcher: PairingWatcher, code: string) {
    this.#room = room;
    this.#watcher = watcher;
    this.code = code;
    this.expiresAt = new Date(room.time.now().getTime() + pairingRules.codeLifetimeMs);
    void room.time.wait(pairingRules.codeLifetimeMs).then(() => {
      if (this.stage.kind === "waiting") this.end("code-expired");
    });
  }

  /** The refusal a handshake gets when this pairing no longer takes a phone. */
  get closedRefusal(): PairRefusal {
    const used = this.stage.kind === "check" || this.stage.kind === "allowing";
    return { reason: used ? "code-used" : "code-ended", triesLeft: 0 };
  }

  async allow(): Promise<void> {
    const stage = this.#awaitingAllow();
    this.stage = { kind: "allowing" };
    try {
      await this.#watcher.paired(stage.phone);
    } catch (error) {
      this.end("closed");
      throw error;
    }
    this.stage = { kind: "over" };
    this.#room.left(this);
    this.#settle?.({ allowed: true });
  }

  deny(): void {
    this.#awaitingAllow();
    this.end("denied");
  }

  close(): void {
    this.end("closed");
  }

  /** Counts a wrong try for this code and the host; the code's last one ends it. */
  wrongTry(): PairRefusal {
    this.#room.failed.count();
    if (this.stage.kind !== "waiting") return this.closedRefusal;
    this.#wrongTries += 1;
    const triesLeft = pairingRules.wrongTriesPerCode - this.#wrongTries;
    if (triesLeft > 0) return { reason: "wrong-code", triesLeft };
    this.end("too-many-tries");
    return { reason: "code-ended", triesLeft: 0 };
  }

  /** A phone used the code: show the check code and wait for Allow. */
  check(ticket: PairingTicket, phone: PairingPhone, checkCode: string): Promise<PairingVerdict> {
    const stage: Stage = { kind: "check", ticket, phone };
    this.stage = stage;
    const verdict = new Promise<PairingVerdict>((resolve) => {
      this.#settle = resolve;
    });
    const allowBy = new Date(this.#room.time.now().getTime() + pairingRules.allowWaitMs);
    void this.#room.time.wait(pairingRules.allowWaitMs).then(() => {
      if (this.stage === stage) this.end("allow-timed-out");
    });
    this.#watcher.check({ checkCode, phone, allowBy });
    return verdict;
  }

  /** Ends the pairing, once; a phone waiting for its verdict hears it was refused. */
  end(reason: DeskEndReason): void {
    if (this.stage.kind === "over") return;
    this.stage = { kind: "over" };
    this.#room.left(this);
    this.#settle?.({
      allowed: false,
      reason: reason === "allow-timed-out" || reason === "phone-left" ? "timed-out" : "denied",
    });
    this.#watcher.ended(reason);
  }

  #awaitingAllow(): Extract<Stage, { kind: "check" }> {
    if (this.stage.kind !== "check") {
      throw new Error("Allow and Don't allow wait for a phone's check code");
    }
    return this.stage;
  }
}

/**
 * One pairing handshake, from the host's message 2 on. The gateway (B3)
 * reports how it ended: `wrongTry` when message 3 didn't decrypt or its
 * commitment didn't match, `useCode` when it did, and `close` when the
 * connection ended. A handshake that ends before either counts as a wrong
 * try, so a leaked code can't be tried against the check code for free.
 */
export class PairingTicket {
  /** The code the handshake's psk comes from. */
  readonly code: string;
  readonly #pairing: Pairing;
  #state: "handshake" | "checking" | "done" = "handshake";

  /** Only the desk makes tickets, in `admit`. */
  constructor(pairing: Pairing) {
    this.#pairing = pairing;
    this.code = pairing.code;
  }

  /** Message 3 didn't decrypt, or its commitment didn't match: one wrong try. */
  wrongTry(): PairRefusal {
    if (this.#state !== "handshake") throw new Error("this handshake has already ended");
    this.#state = "done";
    return this.#pairing.wrongTry();
  }

  /**
   * Message 3 decrypted and matched, so the phone used the code. The first
   * to do so takes it, whether Allow follows or not; any later one is refused.
   */
  useCode(phone: PairingPhone, checkCode: string): CodeUse {
    if (this.#state !== "handshake") throw new Error("this handshake has already ended");
    if (this.#pairing.stage.kind !== "waiting") {
      this.#state = "done";
      return { used: false, refusal: this.#pairing.closedRefusal };
    }
    this.#state = "checking";
    return { used: true, verdict: this.#pairing.check(this, phone, checkCode) };
  }

  /** The handshake's connection ended. Before message 3, a wrong try; while Allow is awaited, the phone left. */
  close(): void {
    if (this.#state === "handshake") {
      this.#state = "done";
      this.#pairing.wrongTry();
      return;
    }
    if (this.#state !== "checking") return;
    this.#state = "done";
    const stage = this.#pairing.stage;
    if (stage.kind === "check" && stage.ticket === this) this.#pairing.end("phone-left");
  }
}

/** What a {@link PairingDesk} runs on. */
export interface PairingDeskOptions {
  readonly time: RemoteTime;
  /** Random bytes for the codes, from a cryptographically secure source. */
  readonly randomBytes: (length: number) => Uint8Array;
}

/**
 * The host's pairing rules, in memory only (requirement
 * `agent-host.remote-pairing-rules`, ADR "Pairing and the end-to-end
 * session"). One pairing is open at a time. Its code lives
 * `pairingRules.codeLifetimeMs` and is used up by the first message 3 that
 * decrypts; Allow is then awaited `pairingRules.allowWaitMs`. A code takes
 * `pairingRules.wrongTriesPerCode` wrong tries, and the host
 * `pairingRules.failedTriesPerMinute` failed tries a minute across codes.
 *
 * The desk compares nothing derived from the code: the Noise handshake,
 * with the code's psk, is the only check of it.
 *
 * @example
 * const pairing = desk.open(watcher); // the dialog shows pairing.code
 * const admission = desk.admit(); // the gateway, on pairing message 1
 */
export class PairingDesk {
  readonly #randomBytes: (length: number) => Uint8Array;
  readonly #room: PairingRoom;
  #open: Pairing | undefined;

  constructor(options: PairingDeskOptions) {
    this.#randomBytes = options.randomBytes;
    this.#room = {
      time: options.time,
      failed: new FailedTries(options.time),
      left: (pairing) => {
        if (this.#open === pairing) this.#open = undefined;
      },
    };
  }

  /** Whether a pairing is open now. */
  get busy(): boolean {
    return this.#open !== undefined;
  }

  /** Opens a pairing with a new code, or gives `undefined` while one is open. */
  open(watcher: PairingWatcher): OpenPairing | undefined {
    if (this.#open !== undefined) return undefined;
    this.#open = new Pairing(this.#room, watcher, newPairingCode(this.#randomBytes));
    return this.#open;
  }

  /** Pairing message 1 arrived: a ticket for its handshake, or the refusal to send. */
  admit(): PairingAdmission {
    if (this.#room.failed.full) {
      return { admitted: false, refusal: { reason: "rate-limited", triesLeft: 0 } };
    }
    const pairing = this.#open;
    if (pairing === undefined) {
      return { admitted: false, refusal: { reason: "code-ended", triesLeft: 0 } };
    }
    if (pairing.stage.kind !== "waiting") {
      return { admitted: false, refusal: pairing.closedRefusal };
    }
    return { admitted: true, ticket: new PairingTicket(pairing) };
  }
}
