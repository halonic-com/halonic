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
): PaperclipMessaging | undefined {
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
  return new PolledWhileSignedIn({
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
 * A provider the poller leaves alone once it is signed out: only a new key,
 * which Connect hands over and which makes a new provider, can sign it in
 * again, so polling on would only repeat the refusal every 30 seconds.
 */
class PolledWhileSignedIn extends PaperclipMessaging {
  override async refresh(): Promise<void> {
    const [source] = await this.listSources();
    if (source?.state.kind === "signed-out") return;
    await super.refresh();
  }
}
