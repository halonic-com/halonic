import type {
  ExternalAddress,
  OpenExternal,
  OpenExternalProviderProps,
} from "@halonicjs/studio-kit";
import type { TauriIpc } from "@halonicjs/studio-services";

/** The kit's sign-in opener (`kit.open-sign-in`), read off the provider's props: `index.ts` is at its size limit. */
type OpenSignIn = NonNullable<OpenExternalProviderProps["openSignIn"]>;

/**
 * The desktop app's `openSignIn` (`kit.open-sign-in`, `studio.desktop-sign-in-window`). It asks the
 * shell's `open_sign_in` to open the page as a small window of the user's own browser, centred on
 * Studio, with the origin of the service the feature signs in to, which the page must be on. When the shell answers anything but `opened` (`fallback` for a browser that isn't
 * Chromium, or off Windows), or refuses, as for a page on another origin, it opens the page with `openExternal`, as every other
 * link, so a sign-in always opens somewhere. A refusal goes to `report` first, since a sign-in
 * button has nobody else to tell.
 *
 * @param ipc - the shell's IPC
 * @param openExternal - how every other page opens, used when the shell opens nothing
 * @returns the opener
 * @throws (the promise rejects) only when a pending address doesn't arrive
 */
export function desktopOpenSignIn(
  ipc: TauriIpc,
  openExternal: OpenExternal,
  report: (error: unknown) => void = (error) => console.error("A sign-in window", error),
): OpenSignIn {
  return async (address: ExternalAddress, origin: string) => {
    const url = await address;
    if (await openedByShell(ipc, url, origin, report)) return;
    await openExternal(url);
  };
}

/** Whether the shell opened `url`, on `origin`, as a sign-in window; a refusal is reported and is a no. */
async function openedByShell(
  ipc: TauriIpc,
  url: string,
  origin: string,
  report: (error: unknown) => void,
): Promise<boolean> {
  try {
    return (await ipc.invoke("open_sign_in", { url, origin })) === "opened";
  } catch (error) {
    report(error);
    return false;
  }
}
