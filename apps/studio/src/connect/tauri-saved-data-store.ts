import type { ComputerId, SavedDataStore } from "@halonicjs/studio-feature-remote/phone";
import type { TauriIpc } from "@halonicjs/studio-services/tauri-ipc";

/**
 * The phone's saved Inbox and Messenger in the Android app (HAL-19026): each call goes to the
 * shell's `phone_saved_*` commands (`src-tauri/src/saved_messaging.rs`), which keep one
 * computer's text in the app's private data, sealed by an Android Keystore key. A refusal
 * rejects, as `SavedMessaging` expects; an answer to a read that isn't text or `null` goes to
 * `report`, without the answer, and reads as nothing saved.
 */
export function tauriSavedDataStore(
  internals: TauriIpc,
  report: (line: string) => void,
): SavedDataStore {
  return {
    read: async (computer: ComputerId) => {
      const answer = await internals.invoke("phone_saved_read", { computer });
      if (typeof answer === "string") return answer;
      if (answer !== null) report("phone_saved_read answered something other than text");
      return undefined;
    },
    write: async (computer: ComputerId, text: string) => {
      await internals.invoke("phone_saved_write", { computer, text });
    },
    clear: async (computer: ComputerId) => {
      await internals.invoke("phone_saved_clear", { computer });
    },
  };
}
