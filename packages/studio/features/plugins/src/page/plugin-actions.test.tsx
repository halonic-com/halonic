// @vitest-environment jsdom

import { parseFile } from "@halonicjs/format";
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PluginCardStatus } from "../cards/plugin-card.tsx";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { noSettings, weather } from "../test-support/plugins.ts";
import { installFakePopover } from "../test-support/popover.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import {
  goesAwayLine,
  type PluginActions,
  type PluginRemoveOutcome,
  removedFromComputerLine,
} from "./plugin-actions.ts";
import { PluginPage } from "./plugin-page.tsx";
import type { InstalledPlugin } from "./plugin-pages.ts";

let removePopover = () => {};
beforeEach(() => {
  fakeModal();
  removePopover = installFakePopover();
});
afterEach(() => {
  unmountAll();
  restoreModal();
  removePopover();
});

/** Page actions that record what they were asked, failing or answering as the test says. */
function recordingActions(
  options: { readonly fail?: keyof PluginActions; readonly removed?: PluginRemoveOutcome } = {},
) {
  const asked: string[] = [];
  const step = (name: keyof PluginActions, detail: string) => {
    asked.push(detail);
    if (options.fail === name) throw new Error("The store is locked.");
  };
  const actions: PluginActions = {
    revoke: async (plugin) => step("revoke", `revoke ${plugin}`),
    remove: async (plugin) => {
      step("remove", `remove ${plugin}`);
      return options.removed ?? { kind: "removed" };
    },
    reload: async () => step("reload", "reload"),
    openFolder: async (plugin) => step("openFolder", `open ${plugin}`),
  };
  return { actions, asked };
}

async function showPage(plugin: InstalledPlugin, actions: PluginActions) {
  const toasts = createToastStore();
  const view = render(
    <ToastStoreProvider store={toasts}>
      <PluginPage plugin={plugin} {...noSettings()} actions={actions} onOpenPanel={() => {}} />
    </ToastStoreProvider>,
  );
  await act(async () => {});
  return { view, toastTitles: () => toasts.list().map((toast) => toast.title) };
}

function menuItems(view: HTMLElement): string[] {
  return [...view.querySelectorAll('[role="menuitem"]')].map(
    (item) => item.textContent?.trim() ?? "",
  );
}

async function pick(view: HTMLElement, label: string) {
  const item = [...view.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (item === undefined) throw new Error(`No menu item ${label}`);
  await act(async () => item.click());
}

/** A button by its words, not a menu item with the same words. */
function button(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button:not([role=menuitem])")].find((candidate) =>
    candidate.textContent?.trim().startsWith(name),
  ) as HTMLButtonElement | undefined;
  if (found === undefined) throw new Error(`No button ${name}`);
  return found;
}

/** Weather standing where the test says, with the settings and secret the Remove dialog names. */
function withSettings(status: PluginCardStatus = "on"): InstalledPlugin {
  const parsed = parseFile(
    "plugin",
    `id: weather
version: 1.2.0
sdk: 1
name: Weather
backend:
  hosts: [api.example.com]
  secrets:
    api-key: { purpose: Reads the forecast., hosts: [api.example.com], as: bearer }
  tools:
    - { name: forecast, description: The forecast., risk: read, untrusted: true }
ui:
  settings:
    city: { label: City, type: text }
    key: { label: API key, type: secret, secret: api-key }
  commands:
    - { id: forecast, title: Show the forecast, tool: forecast }
  cards:
    - { id: today, title: Today's weather, tool: forecast }
  panel: { title: Weather }`,
  );
  if (!parsed.ok) throw new Error(parsed.error.map((problem) => problem.message).join("; "));
  return { ...weather(status), manifest: parsed.value.value };
}

const broken: InstalledPlugin = {
  plugin: "weather",
  name: "weather",
  status: "cant-load",
  commands: [],
  cards: [],
  problems: [{ file: "plugin.yaml", path: [], message: "Its plugin.yaml isn't YAML." }],
};

verifies("plugins.plugin-actions", () => {
  it("names the ⋮ and lists Remove trust only while the plugin is trusted", async () => {
    const { view } = await showPage(weather(), recordingActions().actions);

    expect(view.querySelector('button[aria-label="More actions for Weather"]')).not.toBeNull();
    expect(menuItems(view)).toEqual([
      "Open panel",
      "Open folder",
      "Remove trust",
      "Remove plugin…",
    ]);

    unmountAll();
    const off = await showPage(weather("not-trusted"), recordingActions().actions);
    expect(menuItems(off.view)).toEqual(["Open panel", "Open folder", "Remove plugin…"]);
  });

  it("removes trust at once, and says so in a toast when it can't", async () => {
    const { actions, asked } = recordingActions({ fail: "revoke" });
    const { view, toastTitles } = await showPage(weather(), actions);

    await pick(view, "Remove trust");

    expect(asked).toEqual(["revoke weather"]);
    expect(toastTitles()).toEqual(["Couldn't remove trust: the store is locked."]);
  });

  it("asks before removing, then removes and says so", async () => {
    const { actions, asked } = recordingActions();
    const { view, toastTitles } = await showPage(withSettings(), actions);

    await pick(view, "Remove plugin…");
    const dialog = document.querySelector("dialog");

    expect(dialog?.querySelector("h2")?.textContent).toBe("Remove Weather?");
    expect(dialog?.textContent).toContain(
      "Its tool, command, card and panel go away on this computer.",
    );
    expect(dialog?.textContent).toContain(
      "Its settings and the API key you entered are removed from this computer.",
    );
    expect(document.activeElement?.textContent).toBe("Cancel");

    await act(async () => button("Remove plugin").click());

    expect(asked).toEqual(["remove weather"]);
    expect(toastTitles()).toEqual(["Weather removed"]);
  });

  it("keeps the dialog open and names the secret it couldn't delete", async () => {
    const { actions } = recordingActions({
      removed: { kind: "secret", secret: "api-key", reason: "the keychain is locked" },
    });
    const { view } = await showPage(withSettings(), actions);

    await pick(view, "Remove plugin…");
    await act(async () => button("Remove plugin").click());
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    expect(document.querySelector('dialog [role="alert"]')?.textContent).toContain(
      "Couldn't remove Weather: its secret api-key couldn't be deleted. The keychain is locked.",
    );
  });

  it("checks again and opens the folder of a plugin that can't load", async () => {
    const { actions, asked } = recordingActions();
    await showPage(broken, actions);

    await act(async () => button("Check again").click());
    await act(async () => button("Open folder").click());

    expect(asked).toEqual(["reload", "open weather"]);
  });

  describe("what Remove names", () => {
    it("names only what the plugin adds", () => {
      expect(goesAwayLine(withSettings().manifest)).toBe(
        "Its tool, command, card and panel go away on this computer.",
      );
      expect(goesAwayLine(undefined)).toBe("It goes away from this computer.");
    });

    it("names only what the plugin keeps, and leaves the sentence out when it keeps nothing", () => {
      expect(removedFromComputerLine(withSettings().manifest)).toBe(
        "Its settings and the API key you entered are removed from this computer.",
      );
      expect(removedFromComputerLine(weather().manifest)).toBe("");
    });
  });
});
