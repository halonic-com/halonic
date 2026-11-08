import { createContext, type ReactNode, useContext } from "react";

/**
 * Where a link goes: an address known now, or one that arrives once a request finishes. The
 * Google sign-in address, for example, comes from the host's start route.
 */
export type ExternalAddress = string | Promise<string>;

/**
 * Opens a web page outside Studio. The shell provides it at the root of the app: in the desktop
 * app it waits for the address and hands it to the system browser, and in a browser it opens a
 * new tab.
 *
 * It's called inside the click handler, before anything is awaited, because a browser blocks a
 * tab opened after an `await` as a popup.
 *
 * For a known address the promise never rejects: `ExternalLink` has nobody to tell, so the shell
 * reports its own errors, such as a system browser that didn't start.
 *
 * @returns a promise that settles once the page is open
 * @throws (the promise rejects) only when a pending address didn't arrive; a tab opened for it is
 *   closed
 */
export type OpenExternal = (address: ExternalAddress) => Promise<void>;

/**
 * Opens the page in a new browser tab, without giving it a handle back to Studio. What
 * `ExternalLink` uses when the shell provides nothing else.
 *
 * For an address that arrives later, the tab opens at once, still empty, and gets its address
 * when it arrives. If the address fails, the tab is closed again.
 */
export async function openInNewTab(address: ExternalAddress): Promise<void> {
  if (typeof address === "string") {
    window.open(address, "_blank", "noopener,noreferrer");
    return;
  }
  // Without "noopener", so there's a handle to set the address on; the handle back is cut here.
  const tab = window.open("", "_blank");
  if (tab !== null) {
    tab.opener = null;
  }
  let url: string;
  try {
    url = await address;
  } catch (error) {
    tab?.close();
    throw error;
  }
  if (tab === null) {
    // The browser refused the empty tab. Try once more, now that the address is known.
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  tab.location.href = url;
}

const OpenExternalContext = createContext<OpenExternal>(openInNewTab);

export interface OpenExternalProviderProps {
  readonly openExternal: OpenExternal;
  readonly children: ReactNode;
}

/**
 * Sets how every `ExternalLink` inside it opens its page. The shell puts one at the root of the
 * app; a test puts one around the component it renders.
 *
 * @example
 * <OpenExternalProvider openExternal={async (address) => desktop.openInSystemBrowser(await address)}>
 *   <App />
 * </OpenExternalProvider>
 */
export function OpenExternalProvider({ openExternal, children }: OpenExternalProviderProps) {
  return <OpenExternalContext value={openExternal}>{children}</OpenExternalContext>;
}

/** The `openExternal` service in force where a component renders. */
export function useOpenExternal(): OpenExternal {
  return useContext(OpenExternalContext);
}
