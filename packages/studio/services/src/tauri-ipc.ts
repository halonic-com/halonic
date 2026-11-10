/**
 * Tauri's IPC entry point: the one call a page makes into the shell. The
 * shell's capabilities decide which commands the page may call.
 */
export interface TauriIpc {
  invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
}

/**
 * Where Tauri puts its IPC on every page the shell loads. With
 * `withGlobalTauri` off it is the only Tauri object the page sees. It is
 * Tauri's internal object, not a public API, so this file is the only place
 * that reads it: a Tauri upgrade that moves it changes this line alone.
 */
const ipcProperty = "__TAURI_INTERNALS__";

/**
 * The shell's IPC, or `undefined` when the page isn't running in the shell
 * (for example while working on it in a browser).
 *
 * @param page - the page's global object, usually `window`
 * @throws Error when the page has the property but no `invoke` function on
 *   it, which means a Tauri upgrade changed it and {@link ipcProperty} needs
 *   updating. Failing here is louder than quietly running as if outside the
 *   shell.
 */
export function tauriIpc(page: object): TauriIpc | undefined {
  const internals: unknown = Reflect.get(page, ipcProperty);
  if (internals === undefined) {
    return undefined;
  }
  if (!hasInvoke(internals)) {
    throw new Error(
      `The page has Tauri's ${ipcProperty} but no invoke function on it. Tauri has changed it; update tauriIpc in @halonicjs/studio-services.`,
    );
  }
  return internals;
}

function hasInvoke(value: unknown): value is TauriIpc {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Partial<TauriIpc>).invoke === "function"
  );
}
