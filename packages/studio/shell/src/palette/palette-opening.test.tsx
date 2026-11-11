// @vitest-environment jsdom

import { createToastStore } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createAnnouncer } from "../announcer/announcer.ts";
import type { KeyboardPlatform } from "../points/keybindings.ts";
import { SidebarSearch } from "../sidebar/sidebar-search.tsx";
import { currentLocation, TabSet } from "../tabs/tab-set.ts";
import { useWindowKeys } from "../tabs/use-window-keys.ts";
import { WindowTabStrip } from "../tabs/window-tab-strip.tsx";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";
import { usePaletteOpening } from "./palette-opening.ts";
import { RecentPlaces } from "./recent-places.ts";
import { ShellPalette } from "./shell-palette.tsx";

let restore: (() => void)[] = [];

// A wide window, so **+** sits after the tab strip, not after "1 open tab ▾".
beforeEach(() => {
  restore = [fakeShowModal(), new FakeMediaQueries(1440).install()];
});

afterEach(() => {
  unmountAll();
  for (const undo of restore) {
    undo();
  }
});

/** A desktop app window over one tab on Agents, with the title bar, the Search box and Ctrl K. */
function renderWindow(platform: KeyboardPlatform = "windows") {
  const tabs = new TabSet();
  tabs.openHere({ key: "agents", title: "Agents" });
  const recent = new RecentPlaces(tabs);
  const announcer = createAnnouncer({ timers: new FakeTimers() });
  const toasts = createToastStore();

  function Window() {
    const palette = usePaletteOpening(platform);
    useWindowKeys({ host: "desktop-app", platform, tabs, toasts, onNewTab: palette.show });
    return (
      <>
        <WindowTabStrip tabs={tabs} onNewTab={palette.show} />
        <SidebarSearch platform={platform} onOpen={palette.show} />
        {palette.open ? (
          <ShellPalette
            tabs={tabs}
            recent={recent}
            providers={[]}
            commands={[]}
            kinds={{ get: () => undefined }}
            contextFor={(featureId) => ({ featureId }) as unknown as WorkspaceContext}
            announcer={announcer}
            toasts={toasts}
            notAnswering="The engine isn't answering."
            platform={platform}
            onClose={palette.close}
          />
        ) : null}
      </>
    );
  }

  const view = render(<Window />);
  const button = (name: string) =>
    [...view.querySelectorAll("button")].find(
      (candidate) => (candidate.getAttribute("aria-label") ?? candidate.textContent) === name,
    );
  return {
    tabs,
    view,
    button,
    searchBox: () =>
      [...view.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Search")),
    paletteRow: () => view.querySelector<HTMLInputElement>('[role="combobox"]'),
  };
}

verifies("shell.palette-entry", () => {
  it("shows the Search box with Mod K for the platform", () => {
    const onWindows = renderWindow("windows").searchBox();
    expect(onWindows?.getAttribute("aria-keyshortcuts")).toBe("Control+K");
    expect(onWindows?.textContent).toBe("SearchCtrlK");
    unmountAll();
    const onMac = renderWindow("macos").searchBox();
    expect(onMac?.getAttribute("aria-keyshortcuts")).toBe("Meta+K");
    expect(onMac?.textContent).toBe("Search⌘K");
  });

  it("opens the palette from the Search box", () => {
    const window = renderWindow();
    expect(window.paletteRow()).toBeNull();
    act(() => window.searchBox()?.click());
    expect(window.paletteRow()).not.toBeNull();
    expect(window.tabs.state.tabs).toHaveLength(1);
  });

  it("opens a new tab on Home with the palette over it on +", () => {
    const window = renderWindow();
    act(() => window.button("New tab")?.click());
    expect(window.tabs.state.tabs).toHaveLength(2);
    expect(currentLocation(window.tabs.active).key).toBe("home");
    expect(document.activeElement).toBe(window.paletteRow());
  });

  it("does the same on Ctrl T in the desktop app", () => {
    const window = renderWindow();
    act(() => {
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", { key: "t", code: "KeyT", ctrlKey: true, bubbles: true }),
      );
    });
    expect(window.tabs.state.tabs).toHaveLength(2);
    expect(currentLocation(window.tabs.active).key).toBe("home");
    expect(document.activeElement).toBe(window.paletteRow());
  });
});
