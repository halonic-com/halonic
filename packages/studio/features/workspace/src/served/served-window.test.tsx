// @vitest-environment jsdom

import { createToastStore } from "@halonicjs/studio-kit";
import { createShell, StudioWorkspace } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type MountedServedWindow, mountServedWindow } from "./served-window.tsx";
import type { ServedWorkspace } from "./served-workspace.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let element: HTMLElement;
let mounted: MountedServedWindow | undefined;
let restore: () => void = () => {};

/** A phone: every `(width < Npx)` query matches. `<dialog>` opens without `showModal()`. */
beforeEach(() => {
  const media = window.matchMedia;
  const proto = HTMLDialogElement.prototype;
  window.matchMedia = (query) =>
    ({
      media: query,
      matches: /\(width < \d+px\)/.test(query),
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList;
  Object.defineProperty(proto, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(proto, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
  restore = () => {
    window.matchMedia = media;
    Reflect.deleteProperty(proto, "showModal");
    Reflect.deleteProperty(proto, "close");
  };
  element = document.createElement("div");
  document.body.append(element);
});

afterEach(() => {
  act(() => mounted?.unmount());
  mounted = undefined;
  element.remove();
  restore();
});

const acme: ServedWorkspace = { name: "Acme", sample: false, folder: "~/Projects/acme" };

function start(served: ServedWorkspace | undefined, load: () => Promise<ServedWorkspace>) {
  const shell = createShell({ features: [], host: "served", platform: "linux" });
  const workspace = new StudioWorkspace({
    toasts: createToastStore(),
    services: { provide: () => {}, get: () => undefined as never, has: () => false },
    ...(served === undefined ? {} : { name: served.name }),
  });
  act(() => {
    mounted = mountServedWindow(element, {
      shell,
      workspace,
      host: "served",
      platform: "linux",
      language: "en",
      served,
      load,
    });
  });
}

async function openMore(): Promise<void> {
  const more = [...element.querySelectorAll("a, button")].find(
    (item) => item.textContent?.trim() === "More",
  );
  await act(async () => (more as HTMLElement | undefined)?.click());
}

const row = () => element.querySelector<HTMLButtonElement>('button[aria-label^="Workspace: "]');
const sheet = () => element.querySelector("dialog");

async function pressRow(): Promise<void> {
  await openMore();
  await act(async () => row()?.click());
}

verifies("workspace.served-picker", () => {
  describe("on a phone", () => {
    it("shows the served workspace on More and opens the sheet with its row and the line", async () => {
      start(acme, async () => acme);
      await openMore();
      expect(row()?.textContent).toContain("~/Projects/acme");
      await act(async () => row()?.click());
      await act(async () => {});
      expect(sheet()?.textContent).toContain("Acme");
      expect(sheet()?.textContent).toContain("~/Projects/acme");
      expect(sheet()?.textContent).toContain(
        "To open another workspace, open it on your computer.",
      );
      expect(sheet()?.textContent).not.toContain("Demo");
    });

    it("marks the sample with the Demo tag", async () => {
      const sample = { ...acme, sample: true };
      start(sample, async () => sample);
      await pressRow();
      await act(async () => {});
      expect(sheet()?.textContent).toContain("Demo");
    });

    it("says it is loading while it asks the computer", async () => {
      start(acme, () => new Promise(() => {}));
      await pressRow();
      expect(sheet()?.textContent).toContain("Loading workspaces");
    });

    it("says it couldn't load, and Try again asks once more", async () => {
      // Strict mode runs the sheet's effect twice, so the computer's state is a switch, not a count.
      let down = true;
      start(acme, async () => {
        if (down) throw new Error("down");
        return acme;
      });
      await pressRow();
      await act(async () => {});
      expect(sheet()?.textContent).toContain("Couldn't load workspaces");
      expect(sheet()?.textContent).toContain("Halonic on your computer isn't answering.");
      down = false;
      const again = [...(sheet()?.querySelectorAll("button") ?? [])].find(
        (button) => button.textContent === "Try again",
      );
      await act(async () => again?.click());
      await act(async () => {});
      expect(sheet()?.textContent).toContain("To open another workspace");
    });

    it("has no workspace row when the computer didn't answer at start", async () => {
      start(undefined, async () => acme);
      await openMore();
      expect(row()).toBeNull();
    });
  });
});

const chip = () =>
  [...element.querySelectorAll("button")].find((item) => item.textContent === "Sample answers");

verifies("workspace.try-sample", () => {
  describe("on a phone", () => {
    it("shows the chip under the workspace row, and it opens the sheet with the cost line and the sentence", async () => {
      const sample = { ...acme, sample: true };
      start(sample, async () => sample);
      await openMore();
      expect(chip()).toBeDefined();
      expect(row()?.contains(chip() ?? null)).toBe(false);
      await act(async () => chip()?.click());
      const panel = element.querySelector("aside");
      expect(panel?.querySelector("h2")?.textContent).toBe("Sample answers");
      expect(panel?.textContent).toContain("Runs on the built-in test model");
      expect(panel?.textContent).toContain(
        "To start your own workspace, use Halonic on your computer.",
      );
      expect(panel?.textContent).not.toContain("Fresh copy");
      expect(panel?.textContent).not.toContain("New workspace");
    });

    it("shows no chip when the computer serves another workspace", async () => {
      start(acme, async () => acme);
      await openMore();
      expect(chip()).toBeUndefined();
    });
  });
});
