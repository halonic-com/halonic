import type { AgentNotice, Notifier } from "./agent-notifications.ts";
import type { TauriCallbacks, TauriIpc } from "./tauri-ipc.ts";

/** The shell's event for a click on a notification (`src-tauri/src/notification_clicks.rs`). */
const clickedEvent = "notification-clicked";

/** Tauri's event for the window getting focus. */
const focusEvent = "tauri://focus";

/** The one window the shell opens (`src-tauri/capabilities`). */
const windowLabel = "main";

/** What the shell sends for a click: the item the notification's extra data named. */
interface Clicked {
  messagingId: string;
  kind?: string;
}

/**
 * The desktop shell's notifications, through its notification plugin
 * (`capabilities/desktop-notifications.json`). It asks the person before the
 * first notification and shows nothing while they say no. After a no it asks
 * again on the next start, or after the window gets focus, since the person may
 * have allowed notifications in the system's settings meanwhile.
 *
 * Each notification carries its item in the plugin's extra data. The shell
 * reports a click on it as `notification-clicked`, and this calls that
 * notification's `onClick`, which only opens the item.
 */
export class ShellNotifier implements Notifier {
  readonly #ipc: TauriIpc & TauriCallbacks;
  readonly #onError: (error: unknown) => void;
  readonly #clicks = new Map<string, () => void>();
  /** Each shell listener as it was registered: its event, its callback and the shell's id for it. */
  readonly #listeners: Promise<Listener | undefined>[] = [];
  #allowed: Promise<boolean> | undefined;
  #listening = false;
  #disposed = false;

  /**
   * @param ipc - the shell's IPC with its callback table (`tauriChannelIpc`)
   * @param onError - hears a click or focus listener the shell refused
   */
  constructor(ipc: TauriIpc & TauriCallbacks, onError: (error: unknown) => void) {
    this.#ipc = ipc;
    this.#onError = onError;
  }

  async show(notice: AgentNotice, onClick: () => void): Promise<void> {
    if (this.#disposed) return;
    this.#listen();
    this.#allowed ??= this.#ask();
    if (!(await this.#allowed)) return;
    const { kind, id } = notice.target;
    // A summary names no item, so clicking it opens nothing.
    const extra = id === "" ? {} : { messagingId: id, kind };
    if (this.#disposed) return;
    if (id !== "") this.#clicks.set(clickKey(id, kind), onClick);
    await this.#ipc.invoke("plugin:notification|notify", {
      options: { title: notice.title, body: notice.body, extra },
    });
  }

  /**
   * Stops hearing clicks and focus and forgets every notification's click, so a notification shown
   * for a folder that has since closed opens nothing. Later notifications show nothing.
   */
  async dispose(): Promise<void> {
    this.#disposed = true;
    this.#clicks.clear();
    const listeners = this.#listeners.splice(0);
    await Promise.all(listeners.map(async (listening) => this.#unlisten(await listening)));
  }

  async #unlisten(listener: Listener | undefined): Promise<void> {
    if (listener === undefined) return;
    this.#ipc.unregisterCallback(listener.handler);
    await this.#ipc
      .invoke("plugin:event|unlisten", { event: listener.event, eventId: listener.eventId })
      .catch((error: unknown) => this.#onError(error));
  }

  async #ask(): Promise<boolean> {
    if ((await this.#ipc.invoke("plugin:notification|is_permission_granted")) === true) {
      return true;
    }
    return (await this.#ipc.invoke("plugin:notification|request_permission")) === "granted";
  }

  /** Starts hearing clicks and focus once, before the first notification shows. */
  #listen(): void {
    if (this.#listening) return;
    this.#listening = true;
    this.#on(clickedEvent, (payload) => this.#clicked(payload));
    this.#on(focusEvent, () => this.#focused());
  }

  #on(event: string, handle: (payload: unknown) => void): void {
    const handler = this.#ipc.transformCallback((message) => handle(payloadOf(message)));
    const listening = this.#ipc
      .invoke("plugin:event|listen", {
        event,
        target: { kind: "Window", label: windowLabel },
        handler,
      })
      .then((eventId) => ({ event, handler, eventId }))
      .catch((error: unknown) => {
        this.#ipc.unregisterCallback(handler);
        this.#onError(error);
        return undefined;
      });
    this.#listeners.push(listening);
  }

  #clicked(payload: unknown): void {
    if (!isClicked(payload)) return;
    this.#clicks.get(clickKey(payload.messagingId, payload.kind))?.();
  }

  /** After a no (or a failed ask), the next notification asks again; a yes stays. */
  #focused(): void {
    const allowed = this.#allowed;
    if (allowed === undefined) return;
    const forget = () => {
      if (this.#allowed === allowed) this.#allowed = undefined;
    };
    void allowed.then((granted) => {
      if (!granted) forget();
    }, forget);
  }
}

/** A shell listener to take back on dispose. */
interface Listener {
  readonly event: string;
  readonly handler: number;
  readonly eventId: unknown;
}

function clickKey(id: string, kind: string | undefined): string {
  return `${kind ?? ""}:${id}`;
}

/** Tauri hands a listener `{ event, id, payload }`. */
function payloadOf(message: unknown): unknown {
  if (typeof message !== "object" || message === null || !("payload" in message)) return undefined;
  return message.payload;
}

function isClicked(payload: unknown): payload is Clicked {
  if (typeof payload !== "object" || payload === null) return false;
  if (!("messagingId" in payload) || typeof payload.messagingId !== "string") return false;
  return !("kind" in payload) || typeof payload.kind === "string";
}
