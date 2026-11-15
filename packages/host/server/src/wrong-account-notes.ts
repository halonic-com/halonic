import type { Clock } from "@halonicjs/ports";

/** How long a note lives: long enough to read it after the sign-in tab closes, short enough not to keep an address around. */
export const wrongAccountNoteLifetimeMs = 10 * 60 * 1000;

interface Note {
  readonly signedInAs: string;
  readonly expiresAt: number;
}

/**
 * The address a sign-in came back with when it wasn't the connector's, kept
 * so the open item can say "You signed in as …" and offer to use it. An
 * address is personal data and the setup record may not hold one, so a note
 * lives in memory only: never written to disk, never logged, gone after
 * `wrongAccountNoteLifetimeMs` or a restart. It holds one note per account,
 * and a new one replaces the old.
 */
export class WrongAccountNotes {
  readonly #clock: Clock;
  readonly #notes = new Map<string, Note>();

  constructor(clock: Clock) {
    this.#clock = clock;
  }

  keep(accountRef: string, signedInAs: string): void {
    this.#dropExpired();
    this.#notes.set(accountRef, {
      signedInAs,
      expiresAt: this.#clock.now().getTime() + wrongAccountNoteLifetimeMs,
    });
  }

  /** The address of the account's last wrong sign-in, or `null` when there is none or it has expired. */
  read(accountRef: string): string | null {
    this.#dropExpired();
    return this.#notes.get(accountRef)?.signedInAs ?? null;
  }

  /** Forgets the account's note. Does nothing when there is none. */
  clear(accountRef: string): void {
    this.#notes.delete(accountRef);
  }

  /** Runs on every use, so notes of accounts nobody asks about don't pile up. */
  #dropExpired(): void {
    const now = this.#clock.now().getTime();
    for (const [accountRef, { expiresAt }] of this.#notes) {
      if (expiresAt <= now) {
        this.#notes.delete(accountRef);
      }
    }
  }
}
