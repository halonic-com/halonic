import type { StudioHost } from "@halonicjs/studio-shell";

/** Whether the plugins can be changed here, and whether the view-only line speaks of a phone. */
export interface PluginsViewOnly {
  /** No Add, Trust, Update, Sign in, Remove trust or Remove: a phone, or a served browser. */
  readonly viewOnly: boolean;
  /** The Studio runs on a phone, so the view-only line says "on a phone". */
  readonly phone: boolean;
}

/**
 * Plugins are view only on a phone and in a served browser (design section 10). It follows where
 * the Studio runs, not the window's width: a desktop window narrowed below the phone width, or
 * zoomed to 400 %, gets the phone's layout but keeps every action (HAL-14579).
 *
 * @param place - the host's place: `served` when the plugins come from `halonic serve`
 * @param host - where the window runs (`WorkspaceContext.host`); the desktop app without one
 *
 * @example
 * pluginsViewOnly("app", "desktop-app"); // { viewOnly: false, phone: false }
 * pluginsViewOnly("app", "phone"); // { viewOnly: true, phone: true }
 */
export function pluginsViewOnly(
  place: "app" | "served",
  host: StudioHost = "desktop-app",
): PluginsViewOnly {
  const phone = host === "phone";
  return { phone, viewOnly: phone || host === "served" || place === "served" };
}
