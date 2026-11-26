/**
 * Why the shell couldn't read or change Halonic's login item, as its `login_item_*` commands
 * say it: `not_installed` when this Halonic doesn't run from where it was installed, `failed`
 * when the system refused (the shell's log says which).
 */
export type LoginItemRefusal = "not_installed" | "failed";

/** The shell's answer: whether the login item is on now, or why it couldn't say or change it. */
export type LoginItemAnswer = { readonly on: boolean } | { readonly refused: LoginItemRefusal };

/**
 * What Settings › Startup needs of the desktop shell: Halonic's login item, which starts it in
 * the background when the person logs in. Only the desktop app gives it; served Studio and the
 * demo don't, so the section doesn't show there (`settings.startup-section`).
 */
export interface LoginItemHost {
  /** Where Halonic's icon sits while the window is closed: the menu bar on macOS, else the tray. */
  readonly iconIn: "tray" | "menu-bar";
  /** Whether the login item is on. Reads only. */
  get(): Promise<LoginItemAnswer>;
  /** Turns the login item on or off, and answers whether it is on now. */
  set(on: boolean): Promise<LoginItemAnswer>;
}
