import type { ChangesSource } from "./api.ts";
import type { ListHost, SharedCheck } from "./changes-list-state.ts";
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
  readonly #host: ListHost;

  constructor(host: ListHost) {
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
   * it didn't work. One share runs at a time: pressing again meanwhile gives `undefined` and
   * says nothing.
   */
  async share(): Promise<{ readonly sent: number } | { readonly failed: string } | undefined> {
    const host = this.#host;
    if (host.disposed() || host.state().sharing) return undefined;
    const sent = host.state().unshared;
    host.set({ ...host.state(), sharing: true });
    try {
      await host.source.share();
    } catch (error) {
      if (!host.disposed()) host.set({ ...host.state(), sharing: false });
      return { failed: loadFailureReason(error) };
    }
    // A share only works when the shared copy has nothing this workspace lacks.
    if (!host.disposed()) {
      host.set({ ...host.state(), sharing: false, sharedCheck: { kind: "checked", waiting: 0 } });
    }
    await host.refresh();
    return { sent };
  }

  /**
   * Asks the shared copy what it has and keeps the answer for the strip, then reads again so the
   * counts follow what git now knows. A shared copy that can't be reached is kept as a reason.
   */
  async check(): Promise<void> {
    const host = this.#host;
    if (host.disposed() || !host.state().hasRemote) return;
    let next: SharedCheck;
    try {
      next = { kind: "checked", waiting: await host.source.checkUpdates() };
    } catch (error) {
      next = { kind: "failed", reason: loadFailureReason(error) };
    }
    if (host.disposed()) return;
    host.set({ ...host.state(), sharedCheck: next });
    if (next.kind === "checked") await host.refresh();
  }
}
