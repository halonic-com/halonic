import { type TauriCallbacks, type TauriIpc, tauriChannelIpc } from "./tauri-ipc.ts";

/** Tauri's event for a window whose close button was pressed. */
const closeRequestedEvent = "tauri://close-requested";

/** The one window the shell opens (`src-tauri/capabilities`). */
const windowLabel = "main";

/**
 * Asks to run `handler` when the person closes the window, and closes the window once it has
 * finished, unless it resolves `false`, which keeps the window open. While a listener is registered, Tauri holds the close back until the page destroys the
 * window, so `handler` must settle: a hung one keeps the window open. Outside the shell there is no
 * window to close, so nothing is registered.
 *
 * It reads Tauri's own event and window commands, which the capability `desktop-window` grants.
 *
 * @param page - the page's global object, usually `window`
 * @param handler - what to finish before the window goes; resolve `false` to keep it open
 * @returns a function that stops listening, so a later close is Tauri's own
 */
export function onWindowCloseRequested(
  page: object,
  handler: () => Promise<boolean | undefined>,
): () => Promise<void> {
  const ipc: (TauriIpc & TauriCallbacks) | undefined = tauriChannelIpc(page);
  if (ipc === undefined) return async () => {};
  const callback = ipc.transformCallback(() => {
    void handler()
      .catch((error: unknown) => console.error(error))
      .then((keepOpen) =>
        keepOpen === false
          ? undefined
          : ipc.invoke("plugin:window|destroy", { label: windowLabel }),
      )
      .catch((error: unknown) => console.error(error));
  });
  const listening = ipc
    .invoke("plugin:event|listen", {
      event: closeRequestedEvent,
      target: { kind: "Window", label: windowLabel },
      handler: callback,
    })
    .catch((error: unknown) => {
      ipc.unregisterCallback(callback);
      console.error(error);
      return undefined;
    });
  return async () => {
    const eventId = await listening;
    if (eventId === undefined) return;
    ipc.unregisterCallback(callback);
    await ipc
      .invoke("plugin:event|unlisten", { event: closeRequestedEvent, eventId })
      .catch(() => undefined);
  };
}
