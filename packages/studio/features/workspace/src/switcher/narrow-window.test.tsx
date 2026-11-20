// @vitest-environment jsdom

import { createToastStore } from "@halonicjs/studio-kit";
import { createShell, StudioWorkspace } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CreatedSample } from "../sample/sample-host.ts";
import type { TrustReview, WorkspaceTrustControl } from "../trust/workspace-trust-control.ts";
import { type MountedWorkspaceWindow, mountWorkspaceWindow } from "./mount-workspace-window.tsx";
import { RecentWorkspaces, type RememberedWorkspace } from "./recent-workspaces.ts";
import { folderName, WorkspaceSwitcher } from "./workspace-switcher.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let element: HTMLElement;
let mounted: MountedWorkspaceWindow | undefined;
let restore: () => void = () => {};
/** Every dialog opened with `showModal()`, which the browser makes the rest of the page inert for. */
let modals: HTMLDialogElement[] = [];

/** A desktop window as narrow as a phone: every `(width < Npx)` query matches. */
beforeEach(() => {
  const media = window.matchMedia;
  // jsdom has no popovers, which a menu closes itself with.
  HTMLElement.prototype.hidePopover ??= () => {};
  window.matchMedia = (query) =>
    ({
      media: query,
      matches: /\(width < \d+px\)/.test(query),
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList;
  // jsdom has `<dialog>` but no `showModal()`, nor the inert page behind one.
  const { showModal, close } = HTMLDialogElement.prototype;
  modals = [];
  Object.assign(HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) {
      modals.push(this);
      this.setAttribute("open", "");
    },
    close(this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
  restore = () => {
    window.matchMedia = media;
    Object.assign(HTMLDialogElement.prototype, { showModal, close });
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

const sample: RememberedWorkspace = {
  location: "/docs/Acme sample",
  name: "Acme sample",
  sample: true,
};
const beta: RememberedWorkspace = { location: "/work/Beta", name: "Beta" };

/**
 * The desktop app's window, narrow, showing the remembered sample with Beta in Recent: trusted,
 * unless the test gives it a `trust`.
 */
async function start(trust?: WorkspaceTrustControl) {
  const shell = createShell({ features: [], host: "desktop-app", platform: "windows" });
  const storage = new Map([["halonic.workspace.recent", JSON.stringify([sample, beta])]]);
  const made: CreatedSample = {
    kind: "created",
    folder: "/docs/Acme sample 2",
    name: "Acme sample 2",
    trust: { kind: "trusted" },
  };
  const create = vi.fn(async (_known: readonly string[]) => made);
  const switcher = new WorkspaceSwitcher({
    pickFolder: async () => undefined,
    openFolder: async (location) => {
      const name = folderName(location);
      const services = { provide: () => {}, get: () => undefined, has: () => false };
      const workspace = new StudioWorkspace({
        toasts: createToastStore(),
        services: services as never,
        name,
      });
      return { name, workspace, saving: undefined, trust, dispose: async () => {} };
    },
    recent: new RecentWorkspaces({
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => {
        storage.set(key, value);
      },
    }),
    toasts: shell.toasts,
  });
  act(() => {
    mounted = mountWorkspaceWindow(element, {
      shell,
      switcher,
      platform: "windows",
      language: "en",
      sample: { create },
      // Only its row is looked at here; the dialog it opens has its own tests.
      newWorkspace: {
        defaultParent: () => new Promise(() => {}),
        folderOf: (parent, name) => `${parent}/${name}`,
        probe: async () => ({ kind: "missing" }) as never,
        create: async () => ({ kind: "trusted" }),
      },
    });
  });
  await act(async () => switcher.openLocation(sample.location));
  const more = [...element.querySelectorAll("a, button")].find(
    (each) => each.textContent?.trim() === "More",
  );
  await act(async () => (more as HTMLElement | undefined)?.click());
  return { switcher, create };
}

const workspaceRow = () =>
  element.querySelector<HTMLButtonElement>('button[aria-label^="Workspace: "]');
const chip = () =>
  element.querySelector<HTMLButtonElement>('button[aria-label="Sample, test model"]');
const sheetTitle = () => element.querySelector("dialog[open] h2")?.textContent;

async function pressSheetRow(label: string): Promise<void> {
  const row = [...element.querySelectorAll<HTMLButtonElement>("dialog[open] li > button")].find(
    (each) => each.textContent?.startsWith(label),
  );
  await act(async () => row?.click());
}

verifies("workspace.narrow-window", () => {
  it("keeps the workspace row and the sample chip on More", async () => {
    await start();

    expect(workspaceRow()?.getAttribute("aria-label")).toBe(
      "Workspace: Acme sample. Change workspace",
    );
    expect(chip()).not.toBeNull();
    // The person is on a computer already (HAL-12962).
    expect(element.textContent).toContain("Editing workflows is easier in a wider window.");
  });

  it("opens the workspace menu as a sheet, and a row closes it and switches", async () => {
    const { switcher } = await start();

    await act(async () => workspaceRow()?.click());
    expect(sheetTitle()).toBe("Workspace");
    // The menu's heading stays as the sheet's section label (HAL-12962).
    expect(element.querySelector("dialog[open] h3")?.textContent).toBe("Recent");
    await pressSheetRow("Beta");

    expect(sheetTitle()).toBeUndefined();
    expect(switcher.open.shown?.location).toBe(beta.location);
  });

  it("opens the chip's rows as a sheet, and Fresh copy asks the host for one", async () => {
    const { create } = await start();

    await act(async () => chip()?.click());
    expect(sheetTitle()).toBe("Sample · test model");
    expect(element.querySelector("dialog[open]")?.textContent).toContain("New workspace…");
    await pressSheetRow("Fresh copy of the sample");

    expect(sheetTitle()).toBeUndefined();
    expect(create).toHaveBeenCalledWith([]);
  });
});

/** Presses Escape in the open sheet, as the browser sends it: a `cancel` on the dialog. */
async function pressEscape(): Promise<void> {
  const dialog = element.querySelector("dialog[open]");
  await act(async () => dialog?.dispatchEvent(new Event("cancel", { cancelable: true })));
}

verifies("workspace.narrow-window-sheet-focus", () => {
  it.each([
    ["the workspace row", "Workspace", workspaceRow],
    ["the sample chip", "Sample · test model", chip],
  ])("opens %s's sheet as a modal, so nothing behind it takes focus", async (_, title, opener) => {
    await start();
    opener()?.focus();

    await act(async () => opener()?.click());

    const dialog = element.querySelector("dialog[open]");
    // Strict mode opens it twice; it's the one dialog opened as a modal all the same.
    expect([...new Set(modals)]).toEqual([dialog]);
    const name = document.getElementById(dialog?.getAttribute("aria-labelledby") ?? "");
    expect(name?.textContent).toBe(title);
    expect(document.activeElement?.textContent).toBe(title);
    expect(dialog?.contains(document.activeElement)).toBe(true);
  });

  it.each([
    ["the workspace row", workspaceRow],
    ["the sample chip", chip],
  ])("closes %s's sheet on Escape and gives focus back to it", async (_, opener) => {
    await start();
    opener()?.focus();
    await act(async () => opener()?.click());

    await pressEscape();

    expect(sheetTitle()).toBeUndefined();
    expect(document.activeElement).toBe(opener());
  });
});

const review: TrustReview = {
  title: "Trust Acme sample?",
  source: "Acme sample · /docs/Acme sample",
  changed: false,
  summary: ["Will start 1 program."],
  sections: [],
  fingerprint: "hfp1:abc",
  unpinned: [],
  footnote: "Programs you trust run with your access.",
};

/** A workspace that has been checked and isn't trusted yet. */
const notTrusted: WorkspaceTrustControl = {
  badge: "not-trusted",
  status: "not-trusted",
  trustedAt: undefined,
  failure: undefined,
  retry: async () => {},
  review: () => review,
  remove: async () => ({ ok: true }),
  grant: async () => ({ ok: true }),
  subscribe: () => () => {},
};

// More's badge: the phone's notice strip above the page shows the same one first.
const trustBadge = () =>
  [
    ...element.querySelectorAll<HTMLButtonElement>('button[aria-label="Not trusted yet. Review"]'),
  ].at(-1);

verifies("workspace.narrow-window-trust", () => {
  it("shows Not trusted yet · Review on More in place of the sample chip", async () => {
    await start(notTrusted);

    const badge = trustBadge();
    expect(badge?.textContent).toBe("Not trusted yet · Review");
    // On its own line under the workspace row, as the sample chip would be.
    expect(workspaceRow()?.compareDocumentPosition(badge as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(chip()).toBeNull();
  });

  it("opens the trust check from More's badge", async () => {
    await start(notTrusted);

    await act(async () => trustBadge()?.click());

    expect(element.ownerDocument.querySelector("dialog[open]")?.textContent).toContain(
      "Trust Acme sample?",
    );
  });
});
