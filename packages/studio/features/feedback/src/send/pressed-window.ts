/** The app and the window the shortcut was pressed in, empty where the window can't say. */
export interface PressedWindow {
  /** The app's name as the window's title ends with it, such as "Halonic" or "Halonic Inbox". */
  readonly app: string;
  /** The rest of the window's title, such as "Runs · Acme"; empty for a title that is only the app. */
  readonly window: string;
}

/** No app and no window, as before the window's title is read. */
export const noPressedWindow: PressedWindow = { app: "", window: "" };

/** What a Studio window's title puts between the page, the workspace and the app. */
const separator = " · ";

/** Every Studio window's title ends with the app's name: Halonic, Halonic Inbox, Halonic Messenger. */
const appName = "Halonic";

/**
 * The app and window a Studio window's title names (`shell.window-title`), so the app's name shows
 * once: "Runs · Acme · Halonic" is the app "Halonic" and the window "Runs · Acme", and
 * "Messenger · Acme · Halonic Messenger" is "Halonic Messenger" and "Messenger · Acme". A title
 * that doesn't end with the app's name is all window, with "Halonic" as the app.
 */
export function pressedWindowOf(title: string): PressedWindow {
  const trimmed = title.trim();
  const cut = trimmed.lastIndexOf(separator);
  const last = cut === -1 ? trimmed : trimmed.slice(cut + separator.length);
  if (!last.startsWith(appName)) return { app: appName, window: trimmed };
  return { app: last, window: cut === -1 ? "" : trimmed.slice(0, cut) };
}

/** The line under the crop: "{App} · {Window title} · {W} × {H}", leaving out what's empty. */
export function pressLine(pressed: PressedWindow, size: string): string {
  return [pressed.app, pressed.window, size].filter((part) => part !== "").join(separator);
}
