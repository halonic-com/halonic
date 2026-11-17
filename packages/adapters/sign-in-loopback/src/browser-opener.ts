/** Opens an address in the user's browser, behind a port so Studio and tests can stand in. */
export interface BrowserOpener {
  /**
   * Opens `url`. Gives `false` when the browser could not be opened, so the
   * caller can show the address instead. Only `http` and `https` addresses are opened.
   */
  open(url: string): Promise<boolean>;
}
