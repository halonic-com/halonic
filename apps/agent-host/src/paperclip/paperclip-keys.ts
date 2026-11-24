/** What Studio hands over for one connection: the key and the address and company it was made for. */
export interface PaperclipKeyEntry {
  readonly key: string;
  /** The address the key was made for; only its scheme, host and port count. */
  readonly address: string;
  /** The Paperclip company's ID the key was made for. */
  readonly company: string;
}

/** The connection file as the workspace holds it now: where its requests go, and for which company. */
export interface PaperclipConnectionNow {
  readonly address: string;
  readonly company: string;
}

/** What a request may use: the key, and the origin it may be sent to. */
export interface PaperclipKeyUse {
  readonly key: string;
  /** The scheme, host and port, such as `https://paperclip.acme.test`, with no path. */
  readonly origin: string;
}

/**
 * The answer when the guard makes no call: the source counts as signed out,
 * so Studio asks the person to connect again. It has the shape of a failed
 * answer of the Paperclip client, so the provider passes it on as one.
 */
export interface SignedOut {
  readonly kind: "failed";
  readonly failure: "signed-out";
}

const signedOut: SignedOut = { kind: "failed", failure: "signed-out" };

/**
 * The Paperclip keys Studio handed the host, one per connection, kept in
 * memory only: never on disk, never in an answer or the log. Studio keeps
 * them in the OS keychain, which the host can't read, and hands one over when
 * the person connects (ADR 2026-11-24, agent messaging).
 *
 * The key never comes out of it on its own: the provider sends every request
 * through {@link PaperclipKeys.callWith}, the guard that hands the key only to
 * a request for the address and company the key was made for.
 */
export class PaperclipKeys {
  readonly #entries = new Map<string, { key: string; origin: string; company: string }>();

  /**
   * Keeps `entry` for `connection`, replacing the one held before.
   *
   * @throws RangeError when the entry's address isn't an `http` or `https` address; nothing is changed then
   */
  replace(connection: string, entry: PaperclipKeyEntry): void {
    const origin = originOf(entry.address);
    if (origin === undefined) {
      throw new RangeError("A Paperclip key is kept only with the address it was made for.");
    }
    this.#entries.set(connection, { key: entry.key, origin, company: entry.company });
  }

  /** Drops the key held for `connection`. */
  forget(connection: string): void {
    this.#entries.delete(connection);
  }

  /** Whether a key is held for `connection`; never the key. */
  has(connection: string): boolean {
    return this.#entries.has(connection);
  }

  /**
   * The guard the provider calls before every request (`ports.paperclip-key`):
   * it compares the address (scheme, host and port) and the company the key
   * was made for with the connection file as the workspace holds it now. Only
   * when both match does it run `request` with the key; otherwise, or with no
   * key for the connection, it runs nothing and answers {@link SignedOut}. So
   * a pull, a branch or a clone that changes the file can't send the key to
   * another server or use it for another company.
   *
   * @param connection - the connection's name, its file name without `.yaml`
   * @param now - the connection file as read right before this request
   * @param request - sends the request; it gets the key and the origin the key was made for
   */
  async callWith<T>(
    connection: string,
    now: PaperclipConnectionNow,
    request: (use: PaperclipKeyUse) => Promise<T>,
  ): Promise<T | SignedOut> {
    const entry = this.#entries.get(connection);
    if (entry === undefined) return signedOut;
    if (originOf(now.address) !== entry.origin || now.company !== entry.company) return signedOut;
    return await request({ key: entry.key, origin: entry.origin });
  }
}

/**
 * The address's scheme, host and port, as the browser writes them: `https://Acme.test:443/` is
 * `https://acme.test`. Anything but an `http` or `https` address has none.
 */
function originOf(address: string): string | undefined {
  if (!URL.canParse(address)) return undefined;
  const url = new URL(address);
  return url.protocol === "https:" || url.protocol === "http:" ? url.origin : undefined;
}
