// @vitest-environment jsdom

import { createToastStore } from "@halonicjs/studio-kit";
import { createShell, StudioWorkspace } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  type MountedWorkspaceWindow,
  mountWorkspaceWindow,
} from "../switcher/mount-workspace-window.tsx";
import { RecentWorkspaces } from "../switcher/recent-workspaces.ts";
import { WorkspaceSwitcher } from "../switcher/workspace-switcher.ts";
import type {
  TrustGrantResult,
  TrustReview,
  WorkspaceTrustControl,
} from "./workspace-trust-control.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let element: HTMLElement;
let mounted: MountedWorkspaceWindow | undefined;
let restoreMedia: () => void = () => {};

beforeEach(() => {
  const original = window.matchMedia;
  window.matchMedia = (query) =>
    ({
      media: query,
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList;
  restoreMedia = () => {
    window.matchMedia = original;
  };
  Element.prototype.scrollIntoView ??= () => {};
  // jsdom has no <dialog> methods.
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
  element = document.createElement("div");
  document.body.append(element);
});

afterEach(() => {
  act(() => mounted?.unmount());
  mounted = undefined;
  element.remove();
  restoreMedia();
});

const review: TrustReview = {
  title: "Trust Acme?",
  source: "Acme · /work/acme",
  changed: false,
  summary: ["Will start 1 program."],
  sections: [
    {
      heading: "Programs (1)",
      open: true,
      rows: [{ id: "files", detail: "npx -y files", lines: [], warning: undefined }],
    },
  ],
  fingerprint: "hfp1:abc",
  unpinned: [],
  footnote: "Programs you trust run with your access.",
};

/** A trust control that answers as the test says and records what was granted. */
function control(initial: TrustReview | undefined, grant?: () => Promise<TrustGrantResult>) {
  let current = initial;
  const listeners = new Set<() => void>();
  const granted: string[] = [];
  const value: WorkspaceTrustControl = {
    get badge() {
      return current === undefined ? "none" : "not-trusted";
    },
    review: () => current,
    grant: async (fingerprint) => {
      granted.push(fingerprint);
      return grant === undefined ? { ok: true } : grant();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    value,
    granted,
    set(next: TrustReview | undefined) {
      current = next;
      for (const listener of listeners) listener();
    },
  };
}

async function show(trust: WorkspaceTrustControl) {
  const shell = createShell({ features: [], host: "desktop-app", platform: "windows" });
  const switcher = new WorkspaceSwitcher({
    pickFolder: async () => undefined,
    openFolder: async () => ({
      name: "Acme",
      workspace: new StudioWorkspace({
        toasts: createToastStore(),
        services: {
          provide: () => {},
          get: () => {
            throw new Error("none");
          },
          has: () => false,
        },
        name: "Acme",
      }),
      trust,
      dispose: async () => {},
    }),
    recent: new RecentWorkspaces({ getItem: () => null, setItem: () => {} }),
    toasts: shell.toasts,
  });
  act(() => {
    mounted = mountWorkspaceWindow(element, {
      shell,
      switcher,
      platform: "windows",
      language: "en",
    });
  });
  await act(() => switcher.openLocation("/work/acme"));
  return shell;
}

function badge(): HTMLButtonElement | null {
  return element.querySelector<HTMLButtonElement>('button[aria-label="Not trusted yet. Review"]');
}

function dialog(): HTMLDialogElement | null {
  return document.querySelector("dialog[open]");
}

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("dialog button")].find(
    (candidate): candidate is HTMLButtonElement =>
      candidate.textContent?.trim().startsWith(label) === true,
  );
}

verifies("workspace.trust-badge", () => {
  it("shows nothing before the first check or once the workspace is trusted", async () => {
    const trust = control(undefined);
    await show(trust.value);
    expect(badge()).toBeNull();

    act(() => trust.set(review));
    expect(badge()).not.toBeNull();

    act(() => trust.set(undefined));
    expect(badge()).toBeNull();
  });

  it("opens the check from the badge with Not now focused, and Not now saves nothing", async () => {
    const trust = control(review);
    await show(trust.value);

    act(() => badge()?.click());

    expect(dialog()?.textContent).toContain("Trust Acme?");
    expect(dialog()?.textContent).toContain("Will start 1 program.");
    expect(document.activeElement).toBe(button("Not now"));

    act(() => button("Not now")?.click());
    expect(dialog()).toBeNull();
    expect(trust.granted).toEqual([]);
    expect(badge()).not.toBeNull();
  });

  it("trusts exactly the fingerprint shown and says the workspace can run now", async () => {
    const trust = control(review);
    const shell = await show(trust.value);
    act(() => badge()?.click());

    await act(async () => button("Trust")?.click());

    expect(trust.granted).toEqual(["hfp1:abc"]);
    expect(dialog()).toBeNull();
    expect(shell.toasts.list().map((toast) => toast.title)).toContain("Acme can run now");
  });

  it("stays open and says why when saving fails", async () => {
    const trust = control(review, async () => ({ ok: false, reason: "the disk is full" }));
    const shell = await show(trust.value);
    act(() => badge()?.click());

    await act(async () => button("Trust")?.click());
    // The dialog's alert slot fills a frame after the request ends.
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    expect(dialog()?.textContent).toContain(
      "Couldn't save trust: the disk is full. Nothing was started.",
    );
    expect(shell.toasts.list().map((toast) => toast.title)).not.toContain("Acme can run now");
  });

  it("keeps Trust unavailable until an unpinned program is confirmed", async () => {
    const trust = control({
      ...review,
      unpinned: ["files"],
      sections: [
        {
          heading: "Programs (1)",
          open: true,
          rows: [
            {
              id: "files",
              detail: "npx files",
              lines: [],
              warning: "Can download new code from npm when it starts: version not pinned.",
            },
          ],
        },
      ],
    });
    await show(trust.value);
    act(() => badge()?.click());

    await act(async () => button("Trust")?.click());
    expect(trust.granted).toEqual([]);

    act(() => document.querySelector<HTMLInputElement>('dialog input[type="checkbox"]')?.click());
    await act(async () => button("Trust")?.click());
    expect(trust.granted).toEqual(["hfp1:abc"]);
  });

  it("keeps Trust unavailable for a workspace that can't be trusted, and says why", async () => {
    const trust = control({
      ...review,
      fingerprint: "",
      refused: "The connector mail can't be trusted, because the URL has user info.",
    });
    await show(trust.value);
    act(() => badge()?.click());

    await act(async () => button("Trust")?.click());

    expect(dialog()?.textContent).toContain("the URL has user info");
    expect(trust.granted).toEqual([]);
  });

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
    await act(async () => button("Trust")?.click());
    expect(trust.granted).toEqual(["hfp1:def"]);
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

  it("shows What changed with its tags and the unchanged row", async () => {
    const trust = control({
      ...review,
      title: "Acme changed since you trusted it on 3 Nov",
      changed: true,
      unchanged: "Unchanged (9 items)",
      sections: [
        {
          heading: "Programs",
          open: true,
          rows: [{ id: "files", detail: "npx files@2", lines: [], tag: "New" }],
        },
      ],
    });
    await show(trust.value);
    act(() => badge()?.click());

    expect(dialog()?.textContent).toContain("Acme changed since you trusted it on 3 Nov");
    expect(dialog()?.textContent).toContain("New");
    expect(dialog()?.textContent).toContain("Unchanged (9 items)");
  });
});
