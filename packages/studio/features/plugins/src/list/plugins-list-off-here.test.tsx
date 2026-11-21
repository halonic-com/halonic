// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { InstalledPlugin } from "../page/plugin-pages.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { noActions, weather } from "../test-support/plugins.ts";
import { installFakePopover } from "../test-support/popover.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { PluginUnfencedRuns, UnfencedRunStatus } from "../trust/unfenced-status.ts";
import { PluginsList } from "./plugins-list.tsx";

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

/** The host's answer, counted. */
function host(status: UnfencedRunStatus | Error) {
  return {
    status: vi.fn(async () => {
      if (status instanceof Error) throw status;
      return status;
    }),
    allow: async () => null,
  } satisfies PluginUnfencedRuns;
}

async function show(plugins: readonly InstalledPlugin[], unfencedRuns: PluginUnfencedRuns) {
  const view = render(
    <PluginsList
      load={{ kind: "ready" }}
      plugins={plugins}
      builtIn={[]}
      actions={{ ...noActions().actions, unfencedRuns }}
      onOpen={() => {}}
      onOpenInNewTab={() => {}}
      onRetry={() => {}}
      now={() => new Date(2026, 10, 12)}
    />,
  );
  await act(async () => {});
  return view;
}

const chip = "Off on this computer";

verifies("plugins.plugin-list", () => {
  it("gives a trusted plugin with a backend the off chip while it waits for the yes (C540)", async () => {
    const unfencedRuns = host({ run: "needs-yes", reason: "container" });
    const view = await show([weather("on")], unfencedRuns);

    expect(view.textContent).toContain(chip);
    expect(unfencedRuns.status).toHaveBeenCalledTimes(1);
  });

  it("has no off chip once the yes is saved, in the sandbox, or when the host can't say", async () => {
    for (const status of [
      { run: "allowed", reason: "container", allowedAt: "2026-11-09T10:00:00Z" } as const,
      { run: "fenced" } as const,
      new Error("no host"),
    ]) {
      const view = await show([weather("on")], host(status));
      expect(view.textContent).not.toContain(chip);
      unmountAll();
    }
  });

  it("doesn't ask the host when no plugin that is on has a backend", async () => {
    const unfencedRuns = host({ run: "needs-yes", reason: "container" });
    const view = await show([weather("not-trusted")], unfencedRuns);

    expect(unfencedRuns.status).not.toHaveBeenCalled();
    expect(view.textContent).toContain("Not trusted yet");
    expect(view.textContent).not.toContain(chip);
  });
});
