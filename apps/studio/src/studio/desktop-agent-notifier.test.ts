import { AgentNotifierService } from "@halonicjs/studio-feature-inbox/api";
import { BrowserDisplayPrefs, DisplaySettings } from "@halonicjs/studio-feature-settings";
import { createShell } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { openFolder } from "./start-studio.ts";

/** A desktop page whose shell holds the invented `acme` workspace and answers the rest with nothing. */
function acmeWebview() {
  const answers: Record<string, unknown> = {
    fs_list: ["workspace.yaml"],
    folder_location: "/work/acme",
    folder_entries: [],
    host_settings_read: {},
    plugin_folder_entries: [],
  };
  const invoke = async (command: string, args?: Record<string, unknown>) => {
    if (command === "fs_read") {
      return args?.["path"] === "workspace.yaml" ? "id: acme\nname: Acme\n" : null;
    }
    return answers[command] ?? null;
  };
  const internals = { invoke, transformCallback: () => 1, unregisterCallback: () => {} };
  return { __TAURI_INTERNALS__: internals };
}

function displaySettings(): DisplaySettings {
  const map = new Map<string, string>();
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
  return new DisplaySettings(new BrowserDisplayPrefs(storage, new EventTarget()));
}

verifies("inbox.agent-notifications-start", () => {
  it("gives an opened desktop folder the notifier the Inbox starts its watch with", async () => {
    const shell = createShell({
      features: [],
      hostServices: [AgentNotifierService],
      host: "desktop-app",
      platform: "windows",
    });

    const folder = await openFolder(shell, acmeWebview(), "/work/acme", displaySettings());

    // Without it, the Inbox's notice host starts no watch and no card shows a notification.
    expect(folder.workspace.services.get(AgentNotifierService)).toBeDefined();
    await folder.dispose();
  });
});
