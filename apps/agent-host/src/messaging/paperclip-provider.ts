import {
  type PaperclipAnswer,
  type PaperclipKeyGuard,
  PaperclipMessaging,
} from "@halonicjs/adapter-paperclip-client";
import type {
  PaperclipBinding,
  PaperclipConnectionNow,
  PaperclipKeys,
} from "@halonicjs/host-agent-messaging-hub";
import type { MessagingSource } from "@halonicjs/ports";

/** What {@link paperclipProvider} needs for one connection the person connected. */
export interface PaperclipProviderOptions {
  binding: PaperclipBinding;
  keys: PaperclipKeys;
  /** The connection file's label, such as "Halonic". */
  label: string;
  /** Reads the connection file as it is now; `undefined` when it is gone or broken. */
  readNow: () => Promise<PaperclipConnectionNow | undefined>;
  /** The `fetch` the provider sends with; the global one by default. */
  fetch?: typeof fetch;
  now?: () => Date;
}

const signedOut: PaperclipAnswer = { kind: "failed", failure: "signed-out" };

/**
 * The Paperclip provider for one connection, or `undefined` when the host
 * holds no key for it (`agent-host.paperclip-key`). It is made for the
 * address and company the key was made for, and every request goes through
 * the key's guard: the connection file is read again, and only when its
 * address and company still match is the request sent, with the key. A file
 * that is gone, or a key replaced for another address meanwhile, sends
 * nothing and reads as signed out.
 */
export function paperclipProvider(
  options: PaperclipProviderOptions,
): PaperclipConnectionProvider | undefined {
  const { binding, keys } = options;
  const madeFor = keys.madeFor(binding);
  if (madeFor === undefined) return undefined;
  const guard: PaperclipKeyGuard = async (request) => {
    const now = await options.readNow();
    if (now === undefined) return signedOut;
    return keys.callWith(binding, now, (use) =>
      use.origin === madeFor.address ? request(use.key) : Promise.resolve(signedOut),
    );
  };
  return new PaperclipConnectionProvider({
    address: madeFor.address,
    key: guard,
    connection: binding.connection,
    company: madeFor.company,
    label: `Paperclip · ${options.label}`,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.now === undefined ? {} : { now: options.now }),
  });
}

/**
 * One connection's provider, which knows whom it is signed in as
 * (`agent-host.paperclip-signed-in-user`): two accounts on one Paperclip
 * then read as two sources, "Paperclip · Halonic · Board Supervisor". The
 * poller leaves it alone once it is signed out: only a new key, which Connect
 * hands over and which makes a new provider, can sign it in again, so polling
 * on would only repeat the refusal every 30 seconds.
 */
export class PaperclipConnectionProvider extends PaperclipMessaging {
  /** The user's name once read; `null` once read from a Paperclip that holds none. */
  #userName: string | null | undefined;

  /** The name of the Paperclip user the key belongs to, once read. */
  get userName(): string | undefined {
    return this.#userName ?? undefined;
  }

  /**
   * Reads whom the key belongs to, until one read worked: Connect calls it
   * once, and a poll tries again when Connect's read failed.
   */
  async readUser(): Promise<void> {
    if (this.#userName !== undefined) return;
    const user = await this.signedInUser();
    if (user !== undefined) this.#userName = user.name ?? null;
  }

  override async listSources(): Promise<readonly MessagingSource[]> {
    const sources = await super.listSources();
    const { userName } = this;
    if (userName === undefined) return sources;
    return sources.map((source) => ({ ...source, label: `${source.label} · ${userName}` }));
  }

  override async refresh(): Promise<void> {
    const [source] = await super.listSources();
    if (source?.state.kind === "signed-out") return;
    await this.readUser();
    await super.refresh();
  }
}
