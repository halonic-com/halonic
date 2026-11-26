// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { click } from "../test-support/controls.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { UpdateButtonView } from "./update-button.tsx";
import type { UpdaterHost } from "./updater-host.ts";
import type { UpdateState, UpdateStatus } from "./updater-status.ts";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

const notesUrl = "https://example.test/notes";
const notes = "- The title bar has an Update button.\n- Faster start.";
const available: UpdateState = { kind: "available", version: "0.1.1", notesUrl, notes };
const ready: UpdateState = { kind: "ready", version: "0.1.1", notesUrl, notes };
const downloading: UpdateState = {
  kind: "downloading",
  version: "0.1.1",
  done: 12_000_000,
  total: 48_000_000,
  unit: "bytes",
};

function statusOf(state: UpdateState, rest: Partial<UpdateStatus> = {}): UpdateStatus {
  return {
    current: "0.1.0",
    automatic: false,
    checking: false,
    lastChecked: Date.now(),
    justUpdated: null,
    managed: null,
    state,
    ...rest,
  };
}

/** The title bar's button over a fake updater whose status the test sets. */
async function mount(first: UpdateStatus) {
  const listeners = new Set<(status: UpdateStatus) => void>();
  let now = first;
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
    setTrack: vi.fn(async () => now),
  } satisfies UpdaterHost;
  const onRestart = vi.fn();
  const view = render(<UpdateButtonView host={host} announce={vi.fn()} onRestart={onRestart} />);
  await act(async () => {});
  const set = (next: UpdateStatus) =>
    act(() => {
      now = next;
      for (const listener of listeners) listener(next);
    });
  return { host, onRestart, view, set };
}

const dialog = () => document.querySelector<HTMLDialogElement>("dialog[open]");
// A confirming button also holds its busy label, out of sight.
const buttonNamed = (label: string) =>
  [...(dialog()?.querySelectorAll("button") ?? [])].find(
    (button) => button.textContent?.replace("Restarting…", "") === label,
  );

async function openDialog(view: HTMLElement) {
  const button = view.querySelector("button");
  if (button === null) throw new Error("no Update button");
  await click(button);
}

verifies("settings.update-button", () => {
  describe("the title bar's Update button", () => {
    it("shows only while a newer version is found, downloading or ready, named with it", async () => {
      const { view, set } = await mount(statusOf({ kind: "never-checked" }));
      expect(view.querySelector("button")).toBeNull();
      for (const state of [
        { kind: "up-to-date" } as const,
        { kind: "cant-check", reason: "offline" } as const,
      ]) {
        set(statusOf(state));
        expect(view.querySelector("button")).toBeNull();
      }
      for (const state of [available, downloading, ready]) {
        set(statusOf(state));
        expect(view.querySelector("button")?.textContent).toBe(
          "UpdateUpdate available: Halonic 0.1.1",
        );
      }
      // A ready update has this one button: the status bar shows no Restart to update.
      expect(document.querySelectorAll("button")).toHaveLength(1);
      set(statusOf({ kind: "signature-mismatch", version: "0.1.1", attempts: 2 }));
      expect(view.querySelector("button")).not.toBeNull();
    });

    it("never shows when another tool manages updates", async () => {
      const managed = { by: "scoop", command: "scoop update halonic" } as const;
      const { view } = await mount(statusOf(available, { managed }));
      expect(view.querySelector("button")).toBeNull();
    });
  });
});

verifies("settings.update-dialog", () => {
  describe("the Update available dialog", () => {
    it("installs on a press, shows the download, then offers Restart", async () => {
      const { host, onRestart, view, set } = await mount(statusOf(available));
      await openDialog(view);
      expect(dialog()?.textContent).toContain("Update available");
      expect(dialog()?.textContent).toContain("Halonic 0.1.1 is available. You have 0.1.0.");
      expect(dialog()?.textContent).toContain("Faster start.");
      // The line names the version; no heading says "Halonic 0.1.1" again.
      const headings = [...(dialog()?.querySelectorAll("h1, h2, h3, h4") ?? [])];
      expect(headings.map((heading) => heading.textContent)).not.toContain("Halonic 0.1.1");
      await click(buttonNamed("Install") as HTMLElement);
      expect(host.download).toHaveBeenCalledOnce();

      set(statusOf(downloading));
      expect(dialog()?.querySelector("[role=progressbar]")?.getAttribute("aria-valuenow")).toBe(
        "25",
      );
      expect(buttonNamed("Restart")?.getAttribute("aria-disabled")).toBe("true");
      expect(buttonNamed("Cancel download")).toBeDefined();
      expect(dialog()?.textContent).toContain("Faster start.");

      set(statusOf(ready));
      const restart = buttonNamed("Restart") as HTMLElement;
      expect(restart.getAttribute("aria-disabled")).toBeNull();
      await click(restart);
      expect(onRestart).toHaveBeenCalledOnce();
      expect(dialog()).toBeNull();
    });

    it("offers Restart at once when the update is already downloaded", async () => {
      const { host, onRestart, view } = await mount(statusOf(ready));
      await openDialog(view);
      expect(buttonNamed("Install")).toBeUndefined();
      await click(buttonNamed("Restart") as HTMLElement);
      expect(onRestart).toHaveBeenCalledOnce();
      expect(host.download).not.toHaveBeenCalled();
    });

    it("says why a download failed and tries again on a press", async () => {
      const failed: UpdateState = { kind: "download-failed", version: "0.1.1", reason: "offline" };
      const { host, view } = await mount(statusOf(failed));
      await openDialog(view);
      expect(dialog()?.textContent).toContain("Couldn't download Halonic 0.1.1: you're offline.");
      await click(buttonNamed("Try again") as HTMLElement);
      expect(host.download).toHaveBeenCalledOnce();
    });

    it("says so when the updater doesn't answer a press", async () => {
      const { host, view } = await mount(statusOf(available));
      host.download.mockRejectedValueOnce(new Error("no answer"));
      await openDialog(view);
      await click(buttonNamed("Install") as HTMLElement);
      // The Dialog's alert slot fills a frame after the request ends.
      await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
      expect(dialog()?.textContent).toContain("Halonic's updater didn't answer.");
    });

    it("shows the notes only as text, never as markup", async () => {
      const markup = '<a href="https://evil.test">x</a><script>alert(1)</script>';
      const { view } = await mount(statusOf({ ...available, notes: markup }));
      await openDialog(view);
      expect(dialog()?.textContent).toContain(markup);
      expect(dialog()?.querySelector('a[href="https://evil.test"], script')).toBeNull();
    });

    it("points to the release notes when the update has no notes", async () => {
      const { view } = await mount(statusOf({ kind: "available", version: "0.1.1", notesUrl }));
      await openDialog(view);
      expect(dialog()?.textContent).toContain("The release notes say what changed.");
      expect(dialog()?.textContent).toContain("Release notes");
    });

    it("leaves What changed out when it knows neither notes nor a release page", async () => {
      // A download already under way when the window opened: its states carry no notes.
      const { view } = await mount(statusOf(downloading));
      await openDialog(view);
      expect(dialog()?.querySelector("[role=progressbar]")).not.toBeNull();
      expect(dialog()?.textContent).not.toContain("What changed");
      expect(dialog()?.textContent).not.toContain("The release notes say what changed.");
    });
  });
});
