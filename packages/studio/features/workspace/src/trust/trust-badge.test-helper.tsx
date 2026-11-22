import { createToastStore } from "@halonicjs/studio-kit";
import { createShell, StudioWorkspace } from "@halonicjs/studio-shell";
import { act } from "react";
import {
  type MountedWorkspaceWindow,
  mountWorkspaceWindow,
} from "../switcher/mount-workspace-window.tsx";
import { RecentWorkspaces } from "../switcher/recent-workspaces.ts";
import { WorkspaceSwitcher } from "../switcher/workspace-switcher.ts";
import { TrustAsks } from "./trust-asks.ts";
import type {
  TrustGrantResult,
  TrustReview,
  WorkspaceTrustControl,
} from "./workspace-trust-control.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The element the window mounts in; it is in the page only during a test. */
let element: HTMLElement;
let mounted: MountedWorkspaceWindow | undefined;
let restoreMedia: () => void = () => {};
/** Whether the window is as narrow as a phone, where the status bar doesn't show. */
let phoneWindow = false;

/**
 * Mounts a fresh element for the workspace window, with `matchMedia` answering as
 * {@link setPhoneWindow} says: the test file's `beforeEach`.
 */
export function setUpTrustBadgeWindow(): void {
  const original = window.matchMedia;
  window.matchMedia = (query) =>
    ({
      media: query,
      matches: phoneWindow,
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
}

/** Unmounts the window and removes its element: the test file's `afterEach`. */
export function tearDownTrustBadgeWindow(): void {
  act(() => mounted?.unmount());
  mounted = undefined;
  element.remove();
  restoreMedia();
  phoneWindow = false;
}

/** The element the window is mounted in, for the test running now. */
export function windowElement(): HTMLElement {
  return element;
}

/** Makes the window as narrow as a phone for the rest of the test. */
export function setPhoneWindow(): void {
  phoneWindow = true;
}

/** The check of an untrusted Acme with one program. */
export const review: TrustReview = {
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
export function control(initial: TrustReview | undefined, grant?: () => Promise<TrustGrantResult>) {
  let current = initial;
  const listeners = new Set<() => void>();
  const granted: string[] = [];
  const value: WorkspaceTrustControl = {
    asks: new TrustAsks(),
    get badge() {
      return current === undefined ? "none" : "not-trusted";
    },
    status: current === undefined ? "trusted" : "not-trusted",
    trustedAt: undefined,
    failure: undefined,
    retry: async () => {},
    review: () => current,
    remove: async () => ({ ok: true }),
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

/** Opens Acme with `trust` in the mounted window; returns the shell. */
export async function show(trust: WorkspaceTrustControl) {
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

/** The header badge, or `null` when it isn't shown. */
export function badge(): HTMLButtonElement | null {
  return element.querySelector<HTMLButtonElement>('button[aria-label="Not trusted yet. Review"]');
}

/** The open dialog, if any. */
export function dialog(): HTMLDialogElement | null {
  return document.querySelector("dialog[open]");
}

/** The open dialog's button whose label starts with `label`. */
export function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("dialog button")].find(
    (candidate): candidate is HTMLButtonElement =>
      candidate.textContent?.trim().startsWith(label) === true,
  );
}
