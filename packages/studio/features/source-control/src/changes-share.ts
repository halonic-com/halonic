import type { ChangesSource } from "./api.ts";
import type { MergeHost } from "./changes-merge.ts";
import { shareWords } from "./changes-words.ts";
import { loadFailureReason } from "./load-failure.ts";
import { isShareAddress } from "./share-address.ts";

/**
 * Whether the folder has a shared copy, and how many versions it lacks. The count is zero when
 * git can't say, so the page stays quiet.
 */
export async function readRemote(
  source: ChangesSource,
  ready: boolean,
): Promise<{ hasRemote: boolean; unshared: number }> {
  const hasRemote = ready && (await source.hasRemote());
  if (!hasRemote) return { hasRemote, unshared: 0 };
  try {
    return { hasRemote, unshared: await source.countUnshared() };
  } catch {
    return { hasRemote, unshared: 0 };
  }
}

/** The steps of sharing: adding the place to share to, and sending versions there. */
export class ShareSteps {
  readonly #host: MergeHost;

  constructor(host: MergeHost) {
    this.#host = host;
  }

  /**
   * Makes `address` the place to share to and get updates from, then reads again so the page
   * shows Get updates. Gives why it didn't work, or `undefined`; nothing reaches git for an
   * address that isn't one of the three forms.
   */
  async addAddress(address: string): Promise<string | undefined> {
    const trimmed = address.trim();
    if (!isShareAddress(trimmed)) return shareWords.badAddress;
    try {
      await this.#host.source.addRemote(trimmed);
    } catch (error) {
      // An address may have been added outside Halonic while the dialog was open.
      await this.#host.refresh();
      return loadFailureReason(error);
    }
    await this.#host.refresh();
    return undefined;
  }

  /**
   * Sends the versions the shared copy lacks and reads again. Gives how many were sent, or why
   * it didn't work; one share runs at a time.
   */
  async share(): Promise<{ readonly sent: number } | { readonly failed: string }> {
    const host = this.#host;
    if (host.disposed() || host.state().sharing) return { failed: shareWords.alreadySharing };
    const sent = host.state().unshared;
    host.set({ ...host.state(), sharing: true });
    try {
      await host.source.share();
    } catch (error) {
      if (!host.disposed()) host.set({ ...host.state(), sharing: false });
      return { failed: loadFailureReason(error) };
    }
    if (!host.disposed()) host.set({ ...host.state(), sharing: false });
    await host.refresh();
    return { sent };
  }
}
