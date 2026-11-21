// @vitest-environment jsdom

import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { noActions, noSettings, weather } from "../test-support/plugins.ts";
import { installFakePopover } from "../test-support/popover.ts";
import { render, unmountAll } from "../test-support/render.tsx";
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

const needsYes: UnfencedRunStatus = { run: "needs-yes", reason: "windows" };

/** The host's yes: the status the test sets, and the yes it saves. */
function host(first: UnfencedRunStatus) {
  let status = first;
  const unfencedRuns = {
    status: vi.fn(async () => status),
    allow: vi.fn(async (reason: string) => {
      status = { run: "allowed", reason, allowedAt: new Date(2026, 10, 9, 10).toISOString() };
      return { reason, allowedAt: new Date(2026, 10, 9, 10).toISOString() };
    }),
  } satisfies PluginUnfencedRuns;
  return unfencedRuns;
}

async function show(
  plugin: InstalledPlugin,
  unfencedRuns: PluginUnfencedRuns,
  place: "app" | "served" = "app",
) {
  const view = render(
    <ToastStoreProvider store={createToastStore()}>
      <PluginPage
        plugin={plugin}
        {...noSettings()}
        actions={{ ...noActions().actions, unfencedRuns }}
        onOpenPanel={() => {}}
        place={place}
      />
    </ToastStoreProvider>,
  );
  await act(async () => {});
  return view;
}

function button(view: HTMLElement, name: string): HTMLButtonElement | undefined {
  // A busy-capable button carries a hidden label too, so match the start; an exact match wins.
  const buttons = [...view.ownerDocument.querySelectorAll<HTMLButtonElement>("button")];
  return (
    buttons.find((candidate) => candidate.textContent?.trim() === name) ??
    buttons.find((candidate) => candidate.textContent?.startsWith(name) === true)
  );
}

const offLine =
  "Weather is off on this computer until you allow plugins and integrations to run without the sandbox.";

verifies("plugins.plugin-page-needs-yes", () => {
  it("says a trusted plugin is off until the yes is given, with the fix first and Review second", async () => {
    const view = await show(weather("on"), host(needsYes));

    expect(view.textContent).toContain(offLine);
    expect(view.textContent).toContain(
      "On Windows, plugin code can't run in the sandbox in this version of Halonic. Use Halonic inside WSL 2 on this computer.",
    );
    expect(view.textContent).not.toContain("Trusted on");
    const link = view.querySelector("a");
    const review = button(view, "Review");
    expect(link?.textContent).toContain("How to run Halonic in WSL 2");
    expect(review).toBeDefined();
    // The fix's link comes before Review in the reading order.
    expect(
      link && review ? link.compareDocumentPosition(review) & Node.DOCUMENT_POSITION_FOLLOWING : 0,
    ).not.toBe(0);
  });

  it("opens the trust check with the box from Review, and drops the Callout once the yes is saved", async () => {
    const unfencedRuns = host(needsYes);
    const view = await show(weather("on"), unfencedRuns);

    await act(async () => button(view, "Review")?.click());
    const dialog = document.querySelector("dialog");
    expect(dialog?.textContent).toContain("Trust Weather?");
    const box = dialog?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(box).toBeTruthy();
    await act(async () => box?.click());
    await act(async () => button(view, "Trust")?.click());
    await act(async () => {});

    expect(unfencedRuns.allow).toHaveBeenCalledWith("windows");
    expect(document.querySelector("dialog")).toBeNull();
    expect(view.textContent).not.toContain(offLine);
  });

  it("keeps the status box while a yes for this reason is saved, in the sandbox, or when the host can't say", async () => {
    const allowed = await show(
      weather("on"),
      host({ run: "allowed", reason: "windows", allowedAt: "2026-11-09T10:00:00Z" }),
    );
    expect(allowed.textContent).not.toContain(offLine);
    unmountAll();

    const fenced = await show(weather("on"), host({ run: "fenced" }));
    expect(fenced.textContent).not.toContain(offLine);
    unmountAll();

    const silent = await show(weather("on"), {
      status: () => Promise.reject(new Error("no host")),
      allow: async () => null,
    });
    expect(silent.textContent).not.toContain(offLine);
  });

  it("doesn't ask the host for a plugin that isn't trusted yet", async () => {
    const unfencedRuns = host(needsYes);
    const view = await show(weather("not-trusted"), unfencedRuns);

    expect(unfencedRuns.status).not.toHaveBeenCalled();
    expect(view.textContent).not.toContain(offLine);
  });

  it("says to allow it in the desktop app, with no Review, where the page is view only", async () => {
    const view = await show(weather("on"), host(needsYes), "served");

    expect(view.textContent).toContain(offLine);
    expect(view.textContent).toContain("Allow this in the Halonic desktop app.");
    expect(button(view, "Review")).toBeUndefined();
  });
});
