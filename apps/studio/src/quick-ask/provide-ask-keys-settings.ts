import type { ServiceRegistry } from "@halonicjs/app";
import {
  type AskKeys,
  type AskKeysChange,
  type AskKeysSettings,
  AskKeysSettingsService,
  type AskKeysState,
  type AskOpener,
  AskOpenerService,
} from "@halonicjs/studio-feature-quick-ask/api";
import type { TauriIpc } from "@halonicjs/studio-services";
import type { KeyboardPlatform } from "@halonicjs/studio-shell";

/**
 * Gives Settings → Keyboard quick ask's keys (`studio.quick-ask-settings`), and Help › Quick ask
 * and its Ctrl K entry the box (`feedback.help-quick-ask`), in Studio's own main window only: the
 * shell grants `plugin:quick-ask|shortcut`, `shortcut_set` and `show` to no other window, and
 * served Studio has no shell.
 */
export function provideAskKeysSettings(
  services: ServiceRegistry,
  ipc: TauriIpc | undefined,
  windowLabel: string | undefined,
  platform: KeyboardPlatform,
): void {
  if (ipc === undefined || windowLabel !== "main") return;
  services.provide(AskKeysSettingsService, askKeysSettingsOf(ipc, platform));
  services.provide(AskOpenerService, askOpenerOf(ipc));
}

/** The shell's `plugin:quick-ask|show` (HAL-19411), which shows the box as the tray's Ask… does. */
export function askOpenerOf(ipc: TauriIpc): AskOpener {
  return {
    open: async () => {
      await ipc.invoke("plugin:quick-ask|show");
    },
  };
}

/** The shell's refusals of `shortcut_set` (`quick_ask.rs`). */
const refusals: readonly AskKeysChange[] = ["taken", "invalid", "wayland", "unavailable", "failed"];

/**
 * The shell's `plugin:quick-ask|shortcut` and `shortcut_set` (HAL-18787). A refusal the shell
 * names is the answer; anything else it throws is thrown on, for Settings to say it couldn't save.
 * Saved keys are told to every subscriber, so Help › Quick ask names the new ones.
 */
export function askKeysSettingsOf(ipc: TauriIpc, platform: KeyboardPlatform): AskKeysSettings {
  const listeners = new Set<() => void>();
  return {
    platform,
    keys: async () => askKeysOf(await ipc.invoke("plugin:quick-ask|shortcut")),
    setKeys: async (shortcut) => {
      const change = await saveKeys(ipc, shortcut);
      if (change === "saved") {
        for (const listener of [...listeners]) listener();
      }
      return change;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Asks the shell to save `shortcut`; a refusal it names is the answer, anything else is thrown. */
async function saveKeys(ipc: TauriIpc, shortcut: string): Promise<AskKeysChange> {
  try {
    await ipc.invoke("plugin:quick-ask|shortcut_set", { shortcut });
    return "saved";
  } catch (refusal) {
    const named = refusals.find((each) => each === refusal);
    if (named !== undefined) return named;
    throw new Error(`plugin:quick-ask|shortcut_set refused: ${String(refusal)}`);
  }
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
