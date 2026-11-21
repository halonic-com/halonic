// @vitest-environment jsdom

import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { noActions, noSettings, weather } from "../test-support/plugins.ts";
import { installFakePopover } from "../test-support/popover.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { PluginActions } from "./plugin-actions.ts";
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

const broken: InstalledPlugin = {
  plugin: "weather",
  name: "weather",
  status: "cant-load",
  commands: [],
  cards: [],
  problems: [{ file: "plugin.yaml", path: [], message: "Its plugin.yaml isn't YAML." }],
};

/** The page, with the plugin changing the way the app's list would: `become` swaps it. */
async function show(
  first: InstalledPlugin,
  actions: (become: (next: InstalledPlugin) => void) => Partial<PluginActions>,
) {
  function Harness() {
    const [plugin, setPlugin] = useState(first);
    return (
      <ToastStoreProvider store={createToastStore()}>
        <PluginPage
          plugin={plugin}
          {...noSettings()}
          actions={{ ...noActions().actions, ...actions(setPlugin) }}
          onOpenPanel={() => {}}
        />
      </ToastStoreProvider>
    );
  }
  render(<Harness />);
  await act(async () => {});
}

async function press(name: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
    button.textContent?.trim().startsWith(name),
  );
  if (found === undefined) throw new Error(`No button ${name}`);
  found.focus();
  await act(async () => found.click());
}

function statusBox(): Element | null {
  return document.querySelector("[tabindex='-1']:not(h1):not([role])");
}

verifies("plugins.plugin-page", () => {
  it("leaves focus on the status box after Trust removes Review", async () => {
    await show(weather("not-trusted"), (become) => ({
      trust: async () => become(weather("on")),
    }));
    await press("Review");
    await press("Trust");

    expect(document.querySelector("dialog")).toBeNull();
    expect(statusBox()).not.toBeNull();
    expect(document.activeElement).toBe(statusBox());
  });

  it("leaves focus on the status box once Check again loads the plugin", async () => {
    await show(broken, (become) => ({ reload: async () => become(weather("not-trusted")) }));
    await press("Check again");
    await act(async () => {});

    expect(document.body.textContent).toContain("Review");
    expect(document.activeElement).toBe(statusBox());
  });

  it("keeps focus where it is when Check again still can't load", async () => {
    await show(broken, () => ({ reload: async () => {} }));
    await press("Check again");
    await act(async () => {});

    expect(document.activeElement?.textContent).toContain("Check again");
  });

  it("leaves focus on the status box when Check for updates finds nothing newer", async () => {
    await show(weather(), () => ({ checkForUpdate: async () => ({ kind: "up-to-date" }) }));
    await press("Check for updates");
    await act(async () => {});

    expect(document.body.textContent).toContain("Up to date (1.2.0)");
    expect(document.activeElement).toBe(statusBox());
  });

  it("shows the focus ring on the status box when it takes focus", async () => {
    await show(weather(), () => ({}));
    expect(statusBox()?.classList).toContain("focus-ring");
    expect(statusBox()?.classList).not.toContain("outline-none");
  });

  it("shows the focus ring on the can't-load box when it takes focus", async () => {
    await show(broken, () => ({}));
    expect(statusBox()?.classList).toContain("focus-ring");
    expect(statusBox()?.classList).not.toContain("outline-none");
  });
});
