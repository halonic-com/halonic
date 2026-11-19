// @vitest-environment jsdom

import { createShell, loadView, type SettingsSectionProps } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act, type ComponentType } from "react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { PluginsHostService } from "../api.ts";
import { pluginsFeature } from "../feature.ts";
import type { InstalledPlugin, InstalledPluginsRead } from "../page/plugin-pages.ts";
import { noActions, noSettings, WorkspaceServices, weather } from "../test-support/plugins.ts";
import { render, unmountAll } from "../test-support/render.tsx";

let View: ComponentType<SettingsSectionProps>;

// Load the lazy section up front, under the hook's longer limit (see HAL-11721).
beforeAll(async () => {
  const shell = createShell({ features: [pluginsFeature], hostServices: [PluginsHostService] });
  const section = shell.contributions.settings.list().find(({ id }) => id === "plugins");
  if (section === undefined) throw new Error("No Plugins section");
  View = await loadView<ComponentType<SettingsSectionProps>>(section);
}, 60_000);

afterEach(() => {
  unmountAll();
  vi.useRealTimers();
});

/** A feed whose first read the test decides, and whose reload the test answers. */
function controlledFeed(read: InstalledPluginsRead) {
  let plugins: readonly InstalledPlugin[] = [];
  let firstRead = read;
  const listeners = new Set<() => void>();
  const feed = {
    current: () => plugins,
    firstRead: () => firstRead,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const settle = (next: InstalledPluginsRead, found: readonly InstalledPlugin[] = plugins) => {
    firstRead = next;
    plugins = found;
    for (const listener of listeners) listener();
  };
  return { feed, settle };
}

/** Settings → Plugins inside a section with its heading, as the Settings container draws it. */
function showSection(read: InstalledPluginsRead, reload: () => Promise<void> = async () => {}) {
  const { feed, settle } = controlledFeed(read);
  const shell = createShell({ features: [pluginsFeature], hostServices: [PluginsHostService] });
  const workspace = new WorkspaceServices();
  workspace.provide(PluginsHostService, {
    feed,
    caller: { call: async () => "" },
    ...noSettings(),
    actions: { ...noActions().actions, reload },
  });
  shell.services.instantiate(workspace);
  const view = render(
    <section aria-labelledby="plugins-heading">
      <h3 id="plugins-heading" tabIndex={-1}>
        Plugins
      </h3>
      <View
        context={shell.services.contextFor("plugins", workspace)}
        closeSettings={() => {}}
        place="app"
        surface="window"
      />
    </section>,
  );
  return { view, settle };
}

function tryAgainButton(view: HTMLElement): HTMLButtonElement {
  const button = [...view.querySelectorAll("button")].find((candidate) =>
    candidate.textContent?.startsWith("Try again"),
  );
  if (button === undefined) throw new Error("No Try again");
  return button;
}

verifies("plugins.plugin-settings-load", () => {
  it("P2: shows nothing for 300 ms, then a skeleton read as Loading plugins", () => {
    vi.useFakeTimers();
    const { view, settle } = showSection({ kind: "reading" });
    act(() => vi.advanceTimersByTime(100));
    expect(view.textContent).not.toContain("Loading plugins");
    act(() => vi.advanceTimersByTime(250));
    expect(view.textContent).toContain("Loading plugins");
    act(() => settle({ kind: "ready" }, [weather()]));
    expect(view.textContent).toContain("Weather");
    expect(view.textContent).not.toContain("Loading plugins");
  });

  it("P2: a list that arrives within 300 ms never shows a skeleton", () => {
    vi.useFakeTimers();
    const { view, settle } = showSection({ kind: "reading" });
    act(() => vi.advanceTimersByTime(100));
    act(() => settle({ kind: "ready" }, [weather()]));
    act(() => vi.advanceTimersByTime(1_000));
    expect(view.textContent).not.toContain("Loading plugins");
    expect(view.textContent).toContain("Weather");
  });

  it("P3: says Couldn't load your plugins with a readable reason and Try again", () => {
    const { view } = showSection({ kind: "failed", error: new Error("EACCES /secret/path") });
    expect(view.textContent).toContain("Couldn't load your plugins");
    expect(view.textContent).not.toContain("Couldn't load your plugins:");
    expect(view.textContent).toContain("Halonic couldn't read the plugins on this computer.");
    expect(view.textContent).not.toContain("/secret/path");
    expect(tryAgainButton(view)).toBeDefined();
  });

  it("P3: Try again is busy while it reads, then the focus goes to the section's heading", async () => {
    let answer = () => {};
    const reload = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          answer = resolve;
        }),
    );
    const { view, settle } = showSection({ kind: "failed", error: new Error("x") }, reload);
    const button = tryAgainButton(view);
    button.focus();
    await act(async () => button.click());
    expect(reload).toHaveBeenCalledTimes(1);
    expect(tryAgainButton(view).getAttribute("aria-busy")).toBe("true");
    expect(document.activeElement).toBe(tryAgainButton(view));
    await act(async () => {
      settle({ kind: "ready" }, [weather()]);
      answer();
    });
    expect(view.textContent).toContain("Weather");
    expect(document.activeElement?.id).toBe("plugins-heading");
  });

  it("P3: Try again that fails again keeps the error, with the new reason", async () => {
    const { view, settle } = showSection({ kind: "failed", error: new Error("x") }, async () => {
      settle({ kind: "failed", error: new Error("y") });
      throw new Error("y");
    });
    await act(async () => tryAgainButton(view).click());
    expect(view.textContent).toContain("Couldn't load your plugins");
    expect(tryAgainButton(view).getAttribute("aria-busy")).not.toBe("true");
    expect(document.activeElement?.id).not.toBe("plugins-heading");
  });
});
