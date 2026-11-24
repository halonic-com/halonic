import type { AgentNotice, Notifier } from "./agent-notifications.ts";
import type { TauriIpc } from "./tauri-ipc.ts";

/**
 * The desktop shell's notifications, through its notification plugin
 * (`capabilities/desktop-notifications.json`). It asks the person once,
 * before the first notification, and shows nothing if they say no.
 *
 * The plugin tells no page about a click on desktop, so `onClick` is never
 * called here: clicking brings the system's own default, and Studio opens
 * the item once the shell reports clicks.
 */
export class ShellNotifier implements Notifier {
  readonly #ipc: TauriIpc;
  #allowed: Promise<boolean> | undefined;

  constructor(ipc: TauriIpc) {
    this.#ipc = ipc;
  }

  async show(notice: AgentNotice): Promise<void> {
    this.#allowed ??= this.#askOnce();
    if (!(await this.#allowed)) return;
    await this.#ipc.invoke("plugin:notification|notify", {
      options: { title: notice.title, body: notice.body },
    });
  }

  async #askOnce(): Promise<boolean> {
    if ((await this.#ipc.invoke("plugin:notification|is_permission_granted")) === true) {
      return true;
    }
    return (await this.#ipc.invoke("plugin:notification|request_permission")) === "granted";
  }
}
