import type { ExternalAddress, OpenExternal } from "@halonicjs/studio-kit";
import type { TauriIpc } from "@halonicjs/studio-services";

/**
 * The desktop app's `openSignIn` (`kit.open-sign-in`, `studio.desktop-sign-in-window`). It asks the
 * shell's `open_sign_in` to open the page as a small window of the user's own browser, centred on
 * Studio. When the shell answers anything but `opened` (`fallback` for a browser that isn't
 * Chromium, or off Windows), or refuses, it opens the page with `openExternal`, as every other
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
): OpenExternal {
  return async (address: ExternalAddress) => {
    const url = await address;
    if (await openedByShell(ipc, url, report)) return;
    await openExternal(url);
  };
}

/** Whether the shell opened `url` as a sign-in window; a refusal is reported and is a no. */
async function openedByShell(
  ipc: TauriIpc,
  url: string,
  report: (error: unknown) => void,
): Promise<boolean> {
  try {
    return (await ipc.invoke("open_sign_in", { url })) === "opened";
  } catch (error) {
    report(error);
    return false;
  }
}
