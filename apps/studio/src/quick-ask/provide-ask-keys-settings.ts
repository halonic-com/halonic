import type { ServiceRegistry } from "@halonicjs/app";
import {
  type AskKeys,
  type AskKeysChange,
  type AskKeysSettings,
  AskKeysSettingsService,
  type AskKeysState,
} from "@halonicjs/studio-feature-quick-ask/api";
import type { TauriIpc } from "@halonicjs/studio-services";
import type { KeyboardPlatform } from "@halonicjs/studio-shell";

/**
 * Gives Settings → Keyboard quick ask's keys (`studio.quick-ask-settings`), in Studio's own main
 * window only: the shell grants `plugin:quick-ask|shortcut` and `shortcut_set` to no other window,
 * and served Studio has no shell.
 */
export function provideAskKeysSettings(
  services: ServiceRegistry,
  ipc: TauriIpc | undefined,
  windowLabel: string | undefined,
  platform: KeyboardPlatform,
): void {
  if (ipc === undefined || windowLabel !== "main") return;
  services.provide(AskKeysSettingsService, askKeysSettingsOf(ipc, platform));
}

/** The shell's refusals of `shortcut_set` (`quick_ask.rs`). */
const refusals: readonly AskKeysChange[] = ["taken", "invalid", "wayland", "unavailable", "failed"];

/**
 * The shell's `plugin:quick-ask|shortcut` and `shortcut_set` (HAL-18787). A refusal the shell
 * names is the answer; anything else it throws is thrown on, for Settings to say it couldn't save.
 */
export function askKeysSettingsOf(ipc: TauriIpc, platform: KeyboardPlatform): AskKeysSettings {
  return {
    platform,
    keys: async () => askKeysOf(await ipc.invoke("plugin:quick-ask|shortcut")),
    setKeys: async (shortcut) => {
      try {
        await ipc.invoke("plugin:quick-ask|shortcut_set", { shortcut });
        return "saved";
      } catch (refusal) {
        const named = refusals.find((each) => each === refusal);
        if (named !== undefined) return named;
        throw new Error(`plugin:quick-ask|shortcut_set refused: ${String(refusal)}`);
      }
    },
  };
}

const states: readonly AskKeysState[] = ["on", "taken", "wayland", "unavailable"];

/** The shell's `KeyStatus`, checked: `{ shortcut, state }`. Anything else is a shell bug, thrown. */
export function askKeysOf(answer: unknown): AskKeys {
  if (typeof answer === "object" && answer !== null && "shortcut" in answer && "state" in answer) {
    const { shortcut, state } = answer;
    const known = states.find((each) => each === state);
    if (typeof shortcut === "string" && known !== undefined) return { shortcut, state: known };
  }
  throw new Error(`plugin:quick-ask|shortcut answered ${JSON.stringify(answer)}`);
}
