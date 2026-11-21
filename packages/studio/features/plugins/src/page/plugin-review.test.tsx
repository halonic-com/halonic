// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
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
  toasts = createToastStore();
  fakeModal();
  removePopover = installFakePopover();
});
afterEach(() => {
  unmountAll();
  restoreModal();
  removePopover();
});

let toasts = createToastStore();

async function show(plugin: InstalledPlugin, trust: PluginActions["trust"]) {
  const view = render(
    <ToastStoreProvider store={toasts}>
      <PluginPage
        plugin={plugin}
        {...noSettings()}
        actions={{ ...noActions().actions, trust }}
        onOpenPanel={() => {}}
      />
    </ToastStoreProvider>,
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
    expect(toasts.list().map((toast) => [toast.title, toast.text])).toEqual([
      ["Weather is on", "Its command is in Ctrl K and its card is on Home."],
    ]);
  });

  it("names only what the plugin adds in the toast", async () => {
    const base = weather("not-trusted");
    const ui = base.manifest?.ui;
    if (base.manifest === undefined || ui === undefined) throw new Error("No manifest");
    const without = (change: { commands?: never[]; cards?: never[] }): InstalledPlugin => ({
      ...base,
      manifest: { ...base.manifest, ui: { ...ui, ...change } } as NonNullable<typeof base.manifest>,
    });
    const bodies: (string | undefined)[] = [];
    for (const plugin of [
      without({ cards: [] }),
      without({ commands: [] }),
      without({ commands: [], cards: [] }),
    ]) {
      toasts = createToastStore();
      await show(plugin, async () => {});
      await press("Review");
      await press("Trust");
      bodies.push(toasts.list()[0]?.text);
      unmountAll();
    }
    expect(bodies).toEqual(["Its command is in Ctrl K.", "Its card is on Home.", undefined]);
  });

  it("trusts nothing on Not now", async () => {
    const asked: string[] = [];
    await show(weather("not-trusted"), async (plugin) => {
      asked.push(plugin);
    });
    await press("Review");
    await press("Not now");
    expect(asked).toEqual([]);
    expect(toasts.list()).toEqual([]);
    expect(document.querySelector("dialog")).toBeNull();
  });

  describe("when trust can't be saved", () => {
    it("stays open and says why", async () => {
      await show(weather("not-trusted"), async () => {
        throw new KindedError("unavailable", "The store is locked.");
      });
      await press("Review");
      await press("Trust");
      // The kit fills its alert a frame after the error arrives.
      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      });
      const text = document.querySelector('dialog [role="alert"]')?.textContent ?? "";
      expect(text).toContain("Couldn't save trust: the store is locked. Nothing was started.");
    });
  });
});
