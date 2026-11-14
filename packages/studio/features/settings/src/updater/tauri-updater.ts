import { type TauriCallbacks, TauriChannel, type TauriIpc } from "@halonicjs/studio-services";
import type { UpdaterHost } from "./updater-host.ts";
import type { UpdateStatus } from "./updater-status.ts";

/**
 * The updater as the desktop shell offers it to a page: the shell's `update_*` commands
 * (`apps/studio/src-tauri/src/updates.rs`). The shell has no command to stop watching, and keeps
 * a watch channel until the page reloads, so this opens one channel for the page, when the first
 * listener comes, and tells every listener from it. Stopping a listener only drops it here.
 */
export class TauriUpdater implements UpdaterHost {
  readonly #ipc: TauriIpc & TauriCallbacks;
  readonly #listeners = new Set<(status: UpdateStatus) => void>();
  #latest: UpdateStatus | undefined;
  #channel: TauriChannel | undefined;

  constructor(ipc: TauriIpc & TauriCallbacks) {
    this.#ipc = ipc;
  }

  async status(): Promise<UpdateStatus> {
    return this.#invoke("update_status");
  }

  subscribe(listener: (status: UpdateStatus) => void): () => void {
    this.#listeners.add(listener);
    if (this.#latest !== undefined) {
      listener(this.#latest);
    }
    this.#watch();
    return () => {
      this.#listeners.delete(listener);
    };
  }

  async check(): Promise<UpdateStatus> {
    return this.#invoke("update_check");
  }

  async download(): Promise<UpdateStatus> {
    return this.#invoke("update_download");
  }

  async cancel(): Promise<UpdateStatus> {
    return this.#invoke("update_cancel");
  }

  async restart(): Promise<void> {
    await this.#ipc.invoke("update_restart", {});
  }

  async setAutomatic(on: boolean): Promise<UpdateStatus> {
    return this.#invoke("update_set_automatic", { on });
  }

  async #invoke(command: string, args: Record<string, unknown> = {}): Promise<UpdateStatus> {
    return (await this.#ipc.invoke(command, args)) as UpdateStatus;
  }

  /** Opens the page's one watch channel, unless it is open. The shell sends the status first. */
  #watch(): void {
    if (this.#channel !== undefined) {
      return;
    }
    const channel = new TauriChannel(this.#ipc, (message) => {
      this.#latest = message as UpdateStatus;
      for (const listener of [...this.#listeners]) {
        listener(this.#latest);
      }
    });
    this.#channel = channel;
    this.#ipc.invoke("update_watch", { onStatus: channel.argument }).catch(() => {
      // The shell refused the watch: close the channel, so the next listener tries again.
      channel.close();
      this.#channel = undefined;
    });
  }
}
