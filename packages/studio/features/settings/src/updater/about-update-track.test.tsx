// @vitest-environment jsdom

import type { SettingsSectionProps } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { HalonicVersionService, type UpdaterHost } from "../api.ts";
import { click } from "../test-support/controls.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { AboutHostView, AboutSection } from "./about-section.tsx";
import { TauriUpdater } from "./tauri-updater.ts";
import { trackOf, type UpdateStatus, type UpdateTrack } from "./updater-status.ts";

afterEach(unmountAll);

const STAY_ON =
  "You stay on Halonic 0.1.1-preview.42 until the next Stable version is out. Halonic then updates to it.";

function statusOf(rest: Partial<UpdateStatus> = {}): UpdateStatus {
  return {
    current: "0.1.0",
    automatic: true,
    checking: false,
    lastChecked: Date.now(),
    justUpdated: null,
    managed: null,
    state: { kind: "up-to-date" },
    ...rest,
  };
}

/** An updater that saves the track the way the shell does, and counts the checks. */
function fakeHost(first: UpdateStatus) {
  let now = first;
  const listeners = new Set<(status: UpdateStatus) => void>();
  const tell = (next: UpdateStatus) => {
    now = next;
    for (const listener of listeners) listener(next);
    return next;
  };
  const host = {
    status: vi.fn(async () => now),
    subscribe: vi.fn((listener: (status: UpdateStatus) => void) => {
      listeners.add(listener);
      listener(now);
      return () => listeners.delete(listener);
    }),
    check: vi.fn(async () => now),
    download: vi.fn(async () => now),
    cancel: vi.fn(async () => now),
    restart: vi.fn(async () => undefined),
    setAutomatic: vi.fn(async () => now),
    setTrack: vi.fn(async (track: UpdateTrack) => {
      // As the shell: a change drops the other track's update.
      const changed = trackOf(now) !== track;
      return tell({ ...now, track, state: changed ? { kind: "never-checked" } : now.state });
    }),
  } satisfies UpdaterHost;
  return host;
}

async function show(host: UpdaterHost) {
  const view = render(<AboutHostView host={host} announce={vi.fn()} />);
  await act(async () => {});
  return view;
}

function radio(view: HTMLElement, label: string): HTMLInputElement {
  const found = [...view.querySelectorAll("label")].find((each) =>
    each.textContent?.startsWith(label),
  );
  const input = found?.querySelector<HTMLInputElement>("input[type=radio]");
  if (input == null) throw new Error(`No option "${label}" in: ${view.textContent}`);
  return input;
}

/** The chip stands in the heading's row, beside the heading. */
const chipShown = (view: HTMLElement) => {
  const row = view.querySelector("h3")?.parentElement;
  return [...(row?.children ?? [])].some((each) => each.textContent === "Preview");
};

verifies("settings.about-update-track", () => {
  it("shows Update track with both options, in the approved words, under the automatic switch", async () => {
    const view = await show(fakeHost(statusOf()));
    const text = view.textContent ?? "";

    expect(text).toContain("Update track");
    expect(text).toContain("StableReleased versions. Recommended.");
    expect(text).toContain(
      "PreviewEvery build that passes our tests, sometimes several a day. Not for general use.",
    );
    expect(text.indexOf("Update Halonic automatically")).toBeLessThan(text.indexOf("Update track"));
    expect(text.indexOf("Update track")).toBeLessThan(text.indexOf("Release notes"));
    expect(view.querySelector("[role=radiogroup]")?.getAttribute("aria-labelledby")).toBeTruthy();
  });

  it("picks Stable on a stable build and Preview on a Preview build with nothing saved", async () => {
    const stable = await show(fakeHost(statusOf({ current: "0.1.0" })));
    expect(radio(stable, "Stable").checked).toBe(true);

    const preview = await show(fakeHost(statusOf({ current: "0.1.1-preview.42" })));
    expect(radio(preview, "Preview").checked).toBe(true);
  });

  it("shows a saved choice over the build's track", async () => {
    const onStable = await show(fakeHost(statusOf({ current: "0.1.0", track: "preview" })));
    expect(radio(onStable, "Preview").checked).toBe(true);

    const onPreview = await show(
      fakeHost(statusOf({ current: "0.1.1-preview.42", track: "stable" })),
    );
    expect(radio(onPreview, "Stable").checked).toBe(true);
  });

  it("counts picking Preview as one press of Check now, on the Preview track", async () => {
    const host = fakeHost(statusOf({ track: "stable" }));
    const view = await show(host);
    expect(host.check).not.toHaveBeenCalled();

    await click(radio(view, "Preview"));

    expect(host.setTrack).toHaveBeenCalledExactlyOnceWith("preview");
    expect(host.check).toHaveBeenCalledOnce();
    expect(host.setTrack.mock.invocationCallOrder[0]).toBeLessThan(
      host.check.mock.invocationCallOrder[0] ?? 0,
    );
    expect(radio(view, "Preview").checked).toBe(true);
  });

  it("shows the Preview chip only while a Preview build runs", async () => {
    expect(chipShown(await show(fakeHost(statusOf({ current: "0.1.1-preview.42" }))))).toBe(true);
    expect(chipShown(await show(fakeHost(statusOf({ current: "0.1.0", track: "preview" }))))).toBe(
      false,
    );
  });

  it("on a Preview build, picking Stable says it stays put and drops the downloaded update", async () => {
    const ready = {
      kind: "ready",
      version: "0.1.1-preview.43",
      notesUrl: "https://example.test",
    } as const;
    const host = fakeHost(statusOf({ current: "0.1.1-preview.42", state: ready }));
    const view = await show(host);
    expect(view.textContent).toContain("Halonic 0.1.1-preview.43 is ready.");
    expect(view.textContent).not.toContain(STAY_ON);

    await click(radio(view, "Stable"));

    expect(host.setTrack).toHaveBeenCalledExactlyOnceWith("stable");
    expect(view.textContent).toContain(STAY_ON);
    expect(view.textContent).not.toContain("is ready");
    expect(view.textContent).not.toContain("Restart to update");
  });

  it("isn't offered when Scoop manages updates", async () => {
    const managed = { by: "scoop", command: "scoop update halonic" } as const;
    const view = await show(fakeHost(statusOf({ managed })));
    expect(view.textContent).toContain("Updates are managed by Scoop");
    expect(view.textContent).not.toContain("Update track");
    expect(view.querySelector("[role=radiogroup]")).toBeNull();
  });

  it("isn't offered in the view-only About of a Studio served in a browser", async () => {
    const served = {
      services: {
        find: (key: unknown) => (key === HalonicVersionService ? "0.1.1-preview.42" : undefined),
      },
    } as unknown as SettingsSectionProps["context"];
    const view = render(
      <AboutSection context={served} place="app" surface="window" closeSettings={() => {}} />,
    );
    expect(view.textContent).toContain("Updates are installed on the computer running Halonic.");
    expect(view.textContent).not.toContain("Update track");
    expect(view.querySelector("[role=radiogroup]")).toBeNull();
  });

  it("asks the shell's update_set_track command", async () => {
    const invoke = vi.fn(async () => statusOf({ track: "preview" }));
    const updater = new TauriUpdater({ invoke, transformCallback: vi.fn(() => 1) } as never);

    expect((await updater.setTrack("preview")).track).toBe("preview");
    expect(invoke).toHaveBeenCalledWith("update_set_track", { track: "preview" });
  });
});
