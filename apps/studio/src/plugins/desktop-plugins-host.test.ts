import type { TauriShell } from "@halonicjs/adapter-fs-tauri";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { desktopPluginsHost } from "./desktop-plugins-host.ts";

/** A shell with no plugins installed, which shows `reveal`'s answer and keeps the calls. */
function emptyShell(revealed: boolean) {
  const calls: { command: string; args: Record<string, unknown> | undefined }[] = [];
  const shell: TauriShell = {
    async invoke(command, args) {
      calls.push({ command, args });
      if (command === "plugin_folder_reveal") return revealed;
      return command === "plugin_folder_location" ? null : [];
    },
  };
  return { shell, calls };
}

function hostOver(shell: TauriShell, signedOut: string[] = []) {
  return desktopPluginsHost({
    ipc: shell,
    secrets: {
      get: async () => null,
      has: async () => false,
      set: async () => {},
      remove: async () => {},
    },
    caller: { call: async () => "" },
    handOver: { handOver: async () => 0 },
    signIns: {
      status: async () => [],
      start: async () => "https://auth.example.com/oauth/authorize",
      cancel: async () => {},
      signOut: async () => ({ kind: "notSignedIn" }),
    },
    signOut: async (plugin) => void signedOut.push(plugin),
    onReloadFailed: () => {},
  });
}

verifies("studio.desktop-plugins-host", () => {
  it("lists nothing while no plugin is installed", async () => {
    const { host, reload } = hostOver(emptyShell(true).shell);
    await reload();
    expect(host.feed.current()).toEqual([]);
  });

  it("shows a plugin's folder by its name only, and says when there is none", async () => {
    const shown = emptyShell(true);
    await hostOver(shown.shell).host.actions.openFolder("acme-weather");
    expect(shown.calls).toEqual([
      { command: "plugin_folder_reveal", args: { plugin: "acme-weather" } },
    ]);
    await expect(
      hostOver(emptyShell(false).shell).host.actions.openFolder("acme-weather"),
    ).rejects.toThrow("isn't there");
  });

  it("signs out a plugin's sign-ins at the agent host when its trust is removed", async () => {
    const signedOut: string[] = [];
    const { host } = hostOver(emptyShell(true).shell, signedOut);

    await host.actions.revoke("acme-weather");

    expect(signedOut).toEqual(["acme-weather"]);
  });

  it("says it can't tell which connectors use a plugin rather than naming none", async () => {
    await expect(
      hostOver(emptyShell(true).shell).host.actions.usedBy("acme-weather"),
    ).rejects.toThrow("can't look through every workspace");
  });

  it("refuses to trust a plugin it can't read", async () => {
    await expect(
      hostOver(emptyShell(true).shell).host.actions.trust("acme-weather"),
    ).rejects.toThrow("can't be read");
  });
});
