import type { ServiceRegistry } from "@halonicjs/app";
import {
  type LoginItemAnswer,
  type LoginItemHost,
  type LoginItemRefusal,
  LoginItemService,
} from "@halonicjs/studio-feature-settings/api";
import type { TauriIpc } from "@halonicjs/studio-services";
import type { KeyboardPlatform } from "@halonicjs/studio-shell";

const refusals: readonly LoginItemRefusal[] = ["not_installed", "failed"];

/** Gives Settings › Startup its login item, where this platform has one (see `loginItemOf`). */
export function provideLoginItem(
  services: ServiceRegistry,
  ipc: TauriIpc,
  platform: KeyboardPlatform,
): void {
  const loginItem = loginItemOf(ipc, platform);
  if (loginItem !== undefined) services.provide(LoginItemService, loginItem);
}

/**
 * Settings › Startup's login item over the shell's `login_item_get` and `login_item_set`
 * commands (HAL-14221), which only the main window may call. The shell refuses with
 * `not_installed` or `failed`; any other rejection, or an answer that isn't on or off, is
 * thrown, so it is never read as a setting. Linux gets none, so the section doesn't show there:
 * the shell won't run in the background where it can't tell a tray is visible (D9), so a start
 * at login would exit at once and the section's "starts in the tray" would be wrong (HAL-18088).
 */
export function loginItemOf(ipc: TauriIpc, platform: KeyboardPlatform): LoginItemHost | undefined {
  if (platform === "linux") return undefined;
  return {
    iconIn: platform === "macos" ? "menu-bar" : "tray",
    get: () => answerOf(ipc.invoke("login_item_get")),
    set: (on) => answerOf(ipc.invoke("login_item_set", { on })),
  };
}

async function answerOf(call: Promise<unknown>): Promise<LoginItemAnswer> {
  let answer: unknown;
  try {
    answer = await call;
  } catch (error) {
    const refusal = refusals.find((known) => known === error);
    if (refusal === undefined) throw error;
    return { refused: refusal };
  }
  if (typeof answer !== "boolean")
    throw new Error(`login_item_*: expected on or off, got ${JSON.stringify(answer)}`);
  return { on: answer };
}
