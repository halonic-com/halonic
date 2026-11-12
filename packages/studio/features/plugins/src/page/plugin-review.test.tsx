// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

async function show(plugin: InstalledPlugin, trust: PluginActions["trust"]) {
  const view = render(
    <PluginPage
      plugin={plugin}
      {...noSettings()}
      actions={{ ...noActions().actions, trust }}
      onOpenPanel={() => {}}
    />,
  );
  await act(async () => {});
  return view;
}

function button(name: string): HTMLButtonElement | undefined {
  // A busy-capable button carries a hidden label too, so match the start; an exact match wins.
  const buttons = [...document.querySelectorAll<HTMLButtonElement>("button")];
  return (
    buttons.find((candidate) => candidate.textContent?.trim() === name) ??
    buttons.find((candidate) => candidate.textContent?.startsWith(name) === true)
  );
}

async function press(name: string) {
  const found = button(name);
  if (found === undefined) throw new Error(`No button ${name}`);
  await act(async () => found.click());
}

verifies("plugins.plugin-review", () => {
  it("has Review while not trusted, Review changes once changed, and neither while on", async () => {
    await show(weather("not-trusted"), async () => {});
    expect(button("Review")).toBeDefined();
    expect(button("Review changes")).toBeUndefined();
    unmountAll();
    await show(weather("changed"), async () => {});
    expect(button("Review changes")).toBeDefined();
    unmountAll();
    await show(weather("on"), async () => {});
    expect(button("Review")).toBeUndefined();
    expect(button("Review changes")).toBeUndefined();
  });

  it("opens the trust check from Review and trusts the plugin on Trust", async () => {
    const asked: string[] = [];
    await show(weather("not-trusted"), async (plugin) => {
      asked.push(plugin);
    });
    await press("Review");
    expect(document.querySelector("dialog")?.textContent).toContain("Trust Weather?");

    await press("Trust");

    expect(asked).toEqual(["weather"]);
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("trusts nothing on Not now", async () => {
    const asked: string[] = [];
    await show(weather("not-trusted"), async (plugin) => {
      asked.push(plugin);
    });
    await press("Review");
    await press("Not now");
    expect(asked).toEqual([]);
    expect(document.querySelector("dialog")).toBeNull();
  });

  describe("when trust can't be saved", () => {
    it("stays open and says why", async () => {
      await show(weather("not-trusted"), async () => {
        throw new Error("The store is locked.");
      });
      await press("Review");
      await press("Trust");
      // The kit fills its alert a frame after the error arrives.
      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      });
      const text = document.querySelector('dialog [role="alert"]')?.textContent ?? "";
      expect(text).toContain("Couldn't save trust: The store is locked. Nothing was started.");
    });
  });
});
