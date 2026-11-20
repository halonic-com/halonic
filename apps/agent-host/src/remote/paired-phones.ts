import type { PairedPhone } from "@halonicjs/ports";
import type { PairingPhone } from "./pairing-types.ts";
import {
  deviceId,
  type PhoneRecord,
  readPhoneRecords,
  writePhoneRecords,
} from "./phone-records.ts";
import type { PrivateFile } from "./private-file.ts";
import type { RemoteTime } from "./remote-time.ts";

/** How often a phone's last seen is written while a session with it is open. */
export const lastSeenRefreshMs = 60_000;

/** One open session with a paired phone, as the gateway (B3) holds it. */
export interface PhoneSession {
  /** The session ended: the phone is last seen now. Does nothing the second time. */
  end(): Promise<void>;
}

/** What a {@link PairedPhones} store runs on. */
export interface PairedPhonesOptions {
  readonly file: PrivateFile;
  readonly time: RemoteTime;
  /** Where a write that nobody awaits, the refresh of a last seen, reports its failure. */
  readonly log: (text: string) => void;
}

interface OpenSession {
  /** Closes the connection, after an encrypted `not-paired`. */
  readonly cut: () => void;
}

/**
 * The phones this computer has paired, kept in a file in the profile with
 * public data only (requirement `agent-host.remote-paired-phones`). A phone
 * counts as connected while the gateway holds a session with it, which it
 * opens only once the phone's first transport message decrypted. Its last
 * seen is written when a session ends and every minute while one is open.
 * Revoking a phone cuts its sessions at once.
 *
 * @example
 * const phones = await PairedPhones.open({ file, time, log });
 * const phone = await phones.add({ publicKey, name: "Pixel 8", platform: "android" });
 * const session = phones.connect(phone.id, () => connection.notPaired());
 */
export class PairedPhones {
  readonly #file: PrivateFile;
  readonly #time: RemoteTime;
  readonly #log: (text: string) => void;
  #records: PhoneRecord[];
  readonly #sessions = new Map<string, Set<OpenSession>>();
  readonly #listeners = new Set<() => void>();
  #saving: Promise<void> = Promise.resolve();

  private constructor(options: PairedPhonesOptions, records: PhoneRecord[]) {
    this.#file = options.file;
    this.#time = options.time;
    this.#log = options.log;
    this.#records = records;
  }

  /** Reads the store's file. Rejects when the file is damaged, rather than lose the list. */
  static async open(options: PairedPhonesOptions): Promise<PairedPhones> {
    return new PairedPhones(options, readPhoneRecords(await options.file.read()));
  }

  /** The paired phones, oldest pairing first, as Studio shows them. */
  get phones(): readonly PairedPhone[] {
    return this.#records.map((record) => this.#shown(record));
  }

  /** Calls `listener` after every change to the list; gives the call that stops it. */
  onChange(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** The paired phone with this static key, if there is one. */
  find(publicKey: Uint8Array): PairedPhone | undefined {
    const record = this.#records.find((phone) => phone.id === deviceId(publicKey));
    return record === undefined ? undefined : this.#shown(record);
  }

  /**
   * Keeps a phone Allow was pressed for, named with " (2)" and so on when
   * another paired phone has its name. A phone paired again replaces its
   * old entry, and keeps its open sessions.
   */
  async add(phone: PairingPhone): Promise<PairedPhone> {
    const id = deviceId(phone.publicKey);
    const others = this.#records.filter((record) => record.id !== id);
    const record: PhoneRecord = {
      id,
      publicKey: Buffer.from(phone.publicKey).toString("base64url"),
      name: freeName(phone.name, others),
      platform: phone.platform,
      pairedAt: this.#time.now().toISOString(),
    };
    await this.#change([...others, record]);
    return this.#shown(record);
  }

  /**
   * Unpairs a phone and cuts its sessions at once; an id that isn't paired
   * does nothing. The cut comes before the write, so a write that fails
   * still leaves the phone out until the host stops, and the next write
   * removes it from the file.
   */
  async revoke(phoneId: string): Promise<void> {
    if (!this.#records.some((record) => record.id === phoneId)) return;
    this.#cut([phoneId]);
    await this.#change(this.#records.filter((record) => record.id !== phoneId));
  }

  /** Unpairs every phone and cuts every session, as {@link revoke} does. */
  async revokeAll(): Promise<void> {
    if (this.#records.length === 0) return;
    this.#cut(this.#records.map((record) => record.id));
    await this.#change([]);
  }

  /**
   * A session with a paired phone opened: its first transport message
   * decrypted. `cut` closes it when the phone is revoked.
   *
   * @throws Error when no paired phone has the id
   */
  connect(phoneId: string, cut: () => void): PhoneSession {
    if (!this.#records.some((record) => record.id === phoneId)) {
      throw new Error("No paired phone has that id.");
    }
    const session: OpenSession = { cut };
    let sessions = this.#sessions.get(phoneId);
    if (sessions === undefined) {
      sessions = new Set([session]);
      this.#sessions.set(phoneId, sessions);
      this.#tell();
      void this.#refreshWhileConnected(phoneId, sessions);
    } else {
      sessions.add(session);
    }
    let ended = false;
    return {
      end: async () => {
        if (ended) return;
        ended = true;
        const open = this.#sessions.get(phoneId);
        if (open === undefined || !open.delete(session)) return;
        if (open.size === 0) this.#sessions.delete(phoneId);
        await this.#seen(phoneId);
      },
    };
  }

  /**
   * Refreshes the phone's last seen every minute while `sessions` are its
   * open ones. A phone that disconnects and connects again gets a new set,
   * and so a new loop, and this one stops.
   */
  async #refreshWhileConnected(phoneId: string, sessions: Set<OpenSession>): Promise<void> {
    while (true) {
      await this.#time.wait(lastSeenRefreshMs);
      if (this.#sessions.get(phoneId) !== sessions) return;
      try {
        await this.#seen(phoneId);
      } catch (error) {
        this.#log(`A paired phone's last seen couldn't be saved: ${String(error)}\n`);
      }
    }
  }

  /** Writes the phone's last seen as now; nothing for a phone revoked meanwhile. */
  async #seen(phoneId: string): Promise<void> {
    const lastSeenAt = this.#time.now().toISOString();
    if (!this.#records.some((record) => record.id === phoneId)) return;
    await this.#change(
      this.#records.map((record) => (record.id === phoneId ? { ...record, lastSeenAt } : record)),
    );
  }

  #cut(phoneIds: readonly string[]): void {
    for (const phoneId of phoneIds) {
      const sessions = this.#sessions.get(phoneId);
      this.#sessions.delete(phoneId);
      for (const session of sessions ?? []) session.cut();
    }
  }

  /** Changes the list, tells the listeners and saves it; saves run one after another, in order. */
  #change(records: PhoneRecord[]): Promise<void> {
    this.#records = records;
    this.#tell();
    const text = writePhoneRecords(records);
    const saved = this.#saving.then(() => this.#file.write(text));
    this.#saving = saved.catch(() => undefined);
    return saved;
  }

  #tell(): void {
    for (const listener of this.#listeners) listener();
  }

  #shown(record: PhoneRecord): PairedPhone {
    const { id, name, platform, pairedAt, lastSeenAt } = record;
    return {
      id,
      name,
      platform,
      pairedAt,
      ...(lastSeenAt === undefined ? {} : { lastSeenAt }),
      connected: this.#sessions.has(id),
    };
  }
}

/** The name, or the name with " (2)", " (3)" and so on when one of `others` has it. */
function freeName(name: string, others: readonly PhoneRecord[]): string {
  const taken = new Set(others.map((record) => record.name));
  let free = name;
  for (let count = 2; taken.has(free); count += 1) free = `${name} (${count})`;
  return free;
}
