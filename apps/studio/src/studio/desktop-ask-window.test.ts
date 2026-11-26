import type { TauriIpc } from "@halonicjs/studio-services";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { desktopAskWindow } from "./desktop-ask-window.ts";

/** An ipc that keeps the commands it was asked for, and refuses `refused`. */
function recordingIpc(refused?: string) {
  const invoked: string[] = [];
  const ipc: TauriIpc = {
    invoke: async (command) => {
      invoked.push(command);
      if (command === refused) throw new Error("not_the_box");
      return undefined;
    },
  };
  return { ipc, invoked };
}

verifies("quick-ask.box", () => {
  it("hides the box through plugin:quick-ask|hide and opens Studio through show_main_window", async () => {
    const { ipc, invoked } = recordingIpc();
    const window = desktopAskWindow(ipc);
    await window.hide();
    await window.openStudio();

    expect(invoked).toEqual(["plugin:quick-ask|hide", "show_main_window"]);
  });

  it("passes the shell's refusal on to the box", async () => {
    const { ipc } = recordingIpc("plugin:quick-ask|hide");

    await expect(desktopAskWindow(ipc).hide()).rejects.toThrow("not_the_box");
  });
});
