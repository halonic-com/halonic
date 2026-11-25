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

/**
 * Which connection a key is for: the workspace that holds the connection
 * file, and the file's name. A key is bound to both, so a second workspace
 * with a file of the same name, address and company gets no key until the
 * person connects it too (`agent-host.paperclip-key`).
 */
export interface PaperclipBinding {
  /** The workspace's folder, as the launcher named it. */
  readonly workspace: string;
  /** The connection's name, its file name without `.yaml`. */
  readonly connection: string;
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
   * Keeps `entry` for `binding`, replacing the one held before. Answers a
   * function that puts the one held before back, so a sign-in Studio couldn't
   * keep leaves a connection with its old key (Julian, HAL-18048); the old key
   * stays inside that function and never comes out. `undefined` when no key
   * was held.
   *
   * The function puts the earlier key back only while this call's key is
   * still the one held: a later sign-in or a Disconnect within the hand-over
   * minute must not lose its key to a late undo (Liam, HAL-18103).
   *
   * @throws RangeError when the entry's address isn't `https`, or plain `http` to this computer; nothing is changed then
   */
  replace(binding: PaperclipBinding, entry: PaperclipKeyEntry): (() => void) | undefined {
    const origin = paperclipOrigin(entry.address);
    if (origin === undefined) {
      throw new RangeError("A Paperclip key is kept only with the address it was made for.");
    }
    const name = nameOf(binding);
    const before = this.#entries.get(name);
    const replacement = { key: entry.key, origin, company: entry.company };
    this.#entries.set(name, replacement);
    if (before === undefined) return undefined;
    return () => {
      if (this.#entries.get(name) !== replacement) return;
      this.#entries.set(name, before);
    };
  }

  /** Drops the key held for `binding`. */
  forget(binding: PaperclipBinding): void {
    this.#entries.delete(nameOf(binding));
  }

  /** Whether a key is held for `binding`; never the key. */
  has(binding: PaperclipBinding): boolean {
    return this.#entries.has(nameOf(binding));
  }

  /** The address (scheme, host and port) and company the key held for `binding` was made for; never the key. */
  madeFor(binding: PaperclipBinding): PaperclipConnectionNow | undefined {
    const entry = this.#entries.get(nameOf(binding));
    return entry === undefined ? undefined : { address: entry.origin, company: entry.company };
  }

  /**
   * The guard the provider calls before every request (`agent-host.paperclip-key`):
   * it compares the address (scheme, host and port) and the company the key
   * was made for with the connection file as the workspace holds it now. Only
   * when both match does it run `request` with the key; otherwise, or with no
   * key for the connection, it runs nothing and answers {@link SignedOut}. So
   * a pull, a branch or a clone that changes the file can't send the key to
   * another server or use it for another company.
   *
   * @param binding - the workspace and the connection's name
   * @param now - the connection file as read right before this request
   * @param request - sends the request; it gets the key and the origin the key was made for
   */
  async callWith<T>(
    binding: PaperclipBinding,
    now: PaperclipConnectionNow,
    request: (use: PaperclipKeyUse) => Promise<T>,
  ): Promise<T | SignedOut> {
    const entry = this.#entries.get(nameOf(binding));
    if (entry === undefined) return signedOut;
    if (paperclipOrigin(now.address) !== entry.origin || now.company !== entry.company)
      return signedOut;
    return await request({ key: entry.key, origin: entry.origin });
  }
}

/** Hosts a key may reach over plain `http`: this computer only, as the ADR allows. */
const loopbackHosts: readonly string[] = ["localhost", "127.0.0.1", "[::1]"];

/** One text per binding; JSON keeps a workspace path with any character apart from the name. */
function nameOf(binding: PaperclipBinding): string {
  return JSON.stringify([binding.workspace, binding.connection]);
}

/**
 * The address's scheme, host and port, as the browser writes them: `https://Acme.test:443/` is
 * `https://acme.test`. Anything but an `https` address, or a plain `http` one to this computer,
 * has none: a second safeguard next to the client's own check, so a key never crosses a network
 * in the clear.
 */
export function paperclipOrigin(address: string): string | undefined {
  if (!URL.canParse(address)) return undefined;
  const url = new URL(address);
  if (url.protocol === "https:") return url.origin;
  return url.protocol === "http:" && loopbackHosts.includes(url.hostname) ? url.origin : undefined;
}
