import { createContext, type ReactNode, useContext } from "react";

/**
 * Opens a web page outside Studio. The shell provides it at the root of the app: in the desktop
 * app it hands the address to the system browser, and in a browser it opens a new tab.
 */
export type OpenExternal = (url: string) => void;

/**
 * Opens the page in a new browser tab, without giving it a handle back to Studio. What
 * `ExternalLink` uses when the shell provides nothing else.
 */
export function openInNewTab(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
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
 * <OpenExternalProvider openExternal={(url) => desktop.openInSystemBrowser(url)}>
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
