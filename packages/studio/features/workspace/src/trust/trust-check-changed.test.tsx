// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { REFUSED_PAUSE_MS } from "./trust-check-dialog.tsx";
import {
  badge,
  button,
  control,
  dialog,
  review,
  setUpTrustBadgeWindow,
  show,
  tearDownTrustBadgeWindow,
} from "./trust-badge.test-helper.tsx";

beforeEach(setUpTrustBadgeWindow);
afterEach(() => {
  vi.useRealTimers();
  tearDownTrustBadgeWindow();
});

// The trust check when the workspace changes while it is open (C711).
verifies("workspace.trust-badge", () => {
  it("shows the new check, and says so, when the workspace changes under an open dialog", async () => {
    const trust = control(review);
    await show(trust.value);
    act(() => badge()?.click());

    act(() =>
      trust.set({ ...review, fingerprint: "hfp1:def", summary: ["Will start 2 programs."] }),
    );

    expect(dialog()?.textContent).toContain(
      "This workspace changed while you were reviewing it. Check the new version.",
    );
    expect(dialog()?.textContent).toContain("Will start 2 programs.");
  });

  it("saves nothing for a check that changed after it was shown, and saves the new one next", async () => {
    const trust = control(review);
    await show(trust.value);
    act(() => badge()?.click());
    act(() =>
      trust.set({ ...review, fingerprint: "hfp1:def", summary: ["Will start 2 programs."] }),
    );

    // Only the pause's timer is faked, so the frame below still comes.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await act(async () => button("Trust")?.click());
    // The dialog's alert slot fills a frame later.
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    expect(trust.granted).toEqual([]);
    expect(dialog()?.textContent).toContain(
      "Couldn't save trust: this workspace changed. Nothing was started.",
    );
    expect(dialog()?.textContent).toContain(
      "This workspace changed while you were reviewing it. Check the new version.",
    );
    act(() => vi.advanceTimersByTime(REFUSED_PAUSE_MS));
    await act(async () => button("Trust")?.click());
    expect(trust.granted).toEqual(["hfp1:def"]);
  });

  it("keeps Trust unavailable a moment after it was refused for a change, so a double click saves nothing", async () => {
    const trust = control(review);
    await show(trust.value);
    act(() => badge()?.click());
    act(() =>
      trust.set({ ...review, fingerprint: "hfp1:def", summary: ["Will start 2 programs."] }),
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    // A double click: the second click comes at once, on Trust, wherever focus went.
    await act(async () => button("Trust")?.click());
    await act(async () => button("Trust")?.click());
    expect(trust.granted).toEqual([]);
    expect(button("Trust")?.getAttribute("aria-disabled")).toBe("true");

    act(() => vi.advanceTimersByTime(REFUSED_PAUSE_MS - 1));
    await act(async () => button("Trust")?.click());
    expect(trust.granted).toEqual([]);

    act(() => vi.advanceTimersByTime(1));
    expect(button("Trust")?.getAttribute("aria-disabled")).toBeNull();
    await act(async () => button("Trust")?.click());
    expect(trust.granted).toEqual(["hfp1:def"]);
  });

  it("moves focus to Not now after a Trust refused for a change, so a second Enter saves nothing", async () => {
    const trust = control(review);
    await show(trust.value);
    act(() => badge()?.click());
    act(() =>
      trust.set({ ...review, fingerprint: "hfp1:def", summary: ["Will start 2 programs."] }),
    );
    act(() => button("Trust")?.focus());

    // Enter, Enter: each press activates whatever has focus then.
    await act(async () => (document.activeElement as HTMLElement | null)?.click());
    expect(document.activeElement).toBe(button("Not now"));
    await act(async () => (document.activeElement as HTMLElement | null)?.click());

    expect(trust.granted).toEqual([]);
    expect(dialog()).toBeNull();
  });

  it("clears the confirmation when the check changes under an open dialog", async () => {
    const unpinned = { ...review, unpinned: ["files"] };
    const trust = control(unpinned);
    await show(trust.value);
    act(() => badge()?.click());
    const tick = () => document.querySelector<HTMLInputElement>('dialog input[type="checkbox"]');
    act(() => tick()?.click());
    expect(tick()?.checked).toBe(true);

    act(() => trust.set({ ...unpinned, fingerprint: "hfp1:def" }));

    expect(tick()?.checked).toBe(false);
    await act(async () => button("Trust")?.click());
    expect(trust.granted).toEqual([]);
  });
});
