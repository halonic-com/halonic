// @vitest-environment jsdom

import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { noActions, noSettings, weather } from "../test-support/plugins.ts";
import { installFakePopover } from "../test-support/popover.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { useOffHere } from "../trust/off-here.ts";
import type { PluginUnfencedRuns, UnfencedRunStatus } from "../trust/unfenced-status.ts";
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

const allowed: UnfencedRunStatus = {
  run: "allowed",
  reason: "container",
  allowedAt: "2026-11-21T10:00:00Z",
};

/** The window's yes, whose status the test sets and whose changes it announces. */
function windowYes(first: UnfencedRunStatus) {
  let status = first;
  const listeners = new Set<() => void>();
  const unfencedRuns = {
    status: vi.fn(async () => status),
    allow: vi.fn(async () => null),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } satisfies PluginUnfencedRuns;
  return {
    unfencedRuns,
    listeners,
    takenBack: async () => {
      status = { run: "needs-yes", reason: "container" };
      await act(async () => {
        for (const listener of listeners) listener();
      });
    },
  };
}

async function showPage(plugin: InstalledPlugin, unfencedRuns: PluginUnfencedRuns) {
  const view = render(
    <ToastStoreProvider store={createToastStore()}>
      <PluginPage
        plugin={plugin}
        {...noSettings()}
        actions={{ ...noActions().actions, unfencedRuns }}
        onOpenPanel={() => {}}
        place="app"
      />
    </ToastStoreProvider>,
  );
  await act(async () => {});
  return view;
}

function OffHere(props: {
  readonly unfencedRuns: PluginUnfencedRuns;
  readonly plugins: InstalledPlugin[];
}) {
  return <p>{useOffHere(props.unfencedRuns, props.plugins) ? "off here" : "on"}</p>;
}

const offLine =
  "Weather is off on this computer until you allow plugins and integrations to run without the sandbox.";

verifies("plugins.off-here-follows-yes", () => {
  it("shows R13 on an open plugin page once the yes is taken back", async () => {
    const yes = windowYes(allowed);
    const view = await showPage(weather("on"), yes.unfencedRuns);
    expect(view.textContent).not.toContain(offLine);

    await yes.takenBack();

    expect(view.textContent).toContain(offLine);
  });

  it("asks the host again for the Plugins list once the yes is taken back", async () => {
    const yes = windowYes(allowed);
    const view = render(<OffHere unfencedRuns={yes.unfencedRuns} plugins={[weather("on")]} />);
    await act(async () => {});
    expect(view.textContent).toBe("on");

    await yes.takenBack();

    expect(view.textContent).toBe("off here");
  });

  it("stops listening when the page closes", async () => {
    const yes = windowYes(allowed);
    await showPage(weather("on"), yes.unfencedRuns);
    expect(yes.listeners.size).toBe(1);

    unmountAll();

    expect(yes.listeners.size).toBe(0);
  });
});
