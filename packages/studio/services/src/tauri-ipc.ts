/**
 * Tauri's IPC entry point: the one call a page makes into the shell. The
 * shell's capabilities decide which commands the page may call.
 */
export interface TauriIpc {
  /** Calls a shell command with its arguments; rejects with whatever the shell refuses with. */
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
  return tauriInternals(page, "tauriIpc", ["invoke"]);
}

/**
 * Tauri's callback table, which a `Channel` is made of: the shell sends a
 * channel's messages to the callback whose id the page passed as
 * `__CHANNEL__:<id>`.
 */
export interface TauriCallbacks {
  /** Registers `callback` and returns its id. */
  transformCallback(callback: (message: unknown) => void): number;
  /** Removes a callback, so the shell's later messages to it are dropped. */
  unregisterCallback(id: number): void;
}

/**
 * The shell's IPC with its callback table, which a page needs to read a
 * channel; `undefined` outside the shell.
 *
 * @param page - the page's global object, usually `window`
 * @throws Error when the page has the property but lacks one of the
 *   functions, as {@link tauriIpc} does
 */
export function tauriChannelIpc(page: object): (TauriIpc & TauriCallbacks) | undefined {
  return tauriInternals(page, "tauriChannelIpc", [
    "invoke",
    "transformCallback",
    "unregisterCallback",
  ]);
}

/** The page's `__TAURI_INTERNALS__`, checked for the functions `lookup` uses. */
function tauriInternals<T>(
  page: object,
  lookup: string,
  functions: readonly string[],
): T | undefined {
  const internals: unknown = Reflect.get(page, ipcProperty);
  if (internals === undefined) {
    return undefined;
  }
  const missing = functions.find(
    (name) =>
      typeof internals !== "object" ||
      internals === null ||
      typeof Reflect.get(internals, name) !== "function",
  );
  if (missing !== undefined) {
    throw new Error(
      `The page has Tauri's ${ipcProperty} but no ${missing} function on it. Tauri has changed it; update ${lookup} in @halonicjs/studio-services.`,
    );
  }
  return internals as T;
}
