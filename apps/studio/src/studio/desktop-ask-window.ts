import type { AskWindow } from "@halonicjs/studio-feature-quick-ask/api";
import type { TauriIpc } from "@halonicjs/studio-services";

/**
 * Quick ask's window on the desktop (`quick-ask.box`): the box hides its own window through
 * `plugin:quick-ask|hide`, which the shell grants only the `ask` window, and **Open Studio** brings
 * Studio's window forward through `show_main_window`, as the focused apps' Open Halonic does.
 * **Open in Messenger** asks the shell to open Messenger's window on the chat through
 * `plugin:quick-ask|open_chat`. Each rejects with the shell's refusal, for the box to report.
 */
export function desktopAskWindow(ipc: TauriIpc): AskWindow {
  return {
    hide: async () => {
      await ipc.invoke("plugin:quick-ask|hide");
    },
    openStudio: async () => {
      await ipc.invoke("show_main_window");
    },
    openChat: async (conversation) => {
      await ipc.invoke("plugin:quick-ask|open_chat", { conversation });
    },
  };
}
