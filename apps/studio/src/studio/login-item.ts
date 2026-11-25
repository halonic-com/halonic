import type {
  LoginItemAnswer,
  LoginItemHost,
  LoginItemRefusal,
} from "@halonicjs/studio-feature-settings/api";
import type { TauriIpc } from "@halonicjs/studio-services";
import type { KeyboardPlatform } from "@halonicjs/studio-shell";

const refusals: readonly LoginItemRefusal[] = ["not_installed", "failed"];

/**
 * Settings › Startup's login item over the shell's `login_item_get` and `login_item_set`
 * commands (HAL-14221), which only the main window may call. The shell refuses with
 * `not_installed` or `failed`; any other rejection, or an answer that isn't on or off, is
 * thrown, so it is never read as a setting.
 */
export function loginItemOf(ipc: TauriIpc, platform: KeyboardPlatform): LoginItemHost {
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
