// @vitest-environment jsdom

import { createToastStore, type ToastStore } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import type {
  TrustGrantResult,
  TrustReview,
  WorkspaceTrustControl,
} from "./workspace-trust-control.ts";
import { WorkspaceTrustSection } from "./workspace-trust-section.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let element: HTMLElement;
let root: Root | undefined;

beforeEach(() => {
  Element.prototype.scrollIntoView ??= () => {};
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
  act(() => root?.unmount());
  root = undefined;
  element.remove();
});

const review: TrustReview = {
  title: "Trust Acme?",
  source: "Acme · /work/acme",
  changed: false,
  summary: [],
  sections: [],
  fingerprint: "hfp1:abc",
  unpinned: [],
  footnote: "Programs you trust run with your access.",
};

type Status = WorkspaceTrustControl["status"];

/** A trust control with the status the test sets; removing trust makes it "not-trusted". */
function control(status: Status, remove?: () => Promise<TrustGrantResult>) {
  let current = status;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  let removed = 0;
  const value: WorkspaceTrustControl = {
    get badge() {
      return current === "trusted" ? "none" : "not-trusted";
    },
    get status() {
      return current;
    },
    // 3 Nov 2026 at noon UTC is the same calendar day in every time zone.
    trustedAt:
      status === "trusted" || status === "changed" ? "2026-11-03T12:00:00.000Z" : undefined,
    review: () => (current === "trusted" ? undefined : review),
    grant: async () => ({ ok: true }),
    remove: async () => {
      removed += 1;
      const result = remove === undefined ? ({ ok: true } as const) : await remove();
      if (result.ok) {
        current = "not-trusted";
        notify();
      }
      return result;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return { value, removed: () => removed };
}

function show(trust: WorkspaceTrustControl, toasts: ToastStore = createToastStore()) {
  root = createRoot(element);
  act(() => {
    root?.render(createElement(WorkspaceTrustSection, { trust, name: "Acme", toasts }));
  });
  return toasts;
}

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

function dialogButton(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("dialog button")].find(
    (candidate): candidate is HTMLButtonElement =>
      candidate.textContent?.trim().startsWith(label) === true,
  );
}

verifies("workspace.trust-section", () => {
  it("shows nothing about trust before the first check", () => {
    show(control("unknown").value);
    expect(element.querySelector("h2")?.textContent).toBe("Trust");
    expect(button("Review")).toBeUndefined();
    expect(button("Remove trust")).toBeUndefined();
  });

  it("says when a trusted workspace was trusted and offers Remove trust", () => {
    show(control("trusted").value);
    expect(element.textContent).toContain("Trusted on 3 Nov 2026");
    expect(button("Remove trust")).toBeDefined();
    expect(button("Review")).toBeUndefined();
  });

  it("offers Review for a workspace that isn't trusted yet", () => {
    show(control("not-trusted").value);
    expect(element.textContent).toContain(
      "Not trusted yet. Halonic won't start programs or call real models from this workspace.",
    );
    expect(button("Review")).toBeDefined();
  });

  it("offers Review changes for a workspace that changed", () => {
    show(control("changed").value);
    expect(element.textContent).toContain("Changed since you trusted it on 3 Nov.");
    expect(button("Review changes")).toBeDefined();
  });

  it("opens the same trust check as the badge from Review", () => {
    show(control("not-trusted").value);
    act(() => button("Review")?.click());
    expect(document.querySelector("dialog[open]")?.textContent).toContain("Trust Acme?");
  });

  it("asks before removing trust, with Cancel focused, and Cancel removes nothing", () => {
    const trust = control("trusted");
    show(trust.value);
    act(() => button("Remove trust")?.click());
    const dialog = document.querySelector("dialog[open]");
    expect(dialog?.textContent).toContain("Remove trust from Acme?");
    expect(dialog?.textContent).toContain("Halonic will ask again before running anything");
    expect(document.activeElement).toBe(button("Cancel"));
    act(() => button("Cancel")?.click());
    expect(document.querySelector("dialog[open]")).toBeNull();
    expect(trust.removed()).toBe(0);
  });

  it("removes trust, says so in a toast and puts focus on Review", async () => {
    const trust = control("trusted");
    const toasts = show(trust.value);
    act(() => button("Remove trust")?.click());
    await act(async () => {
      dialogButton("Remove trust")?.click();
    });
    await act(async () => {});
    expect(trust.removed()).toBe(1);
    expect(toasts.list().map((toast) => toast.title)).toContain("Removed trust from Acme");
    expect(button("Review")).toBeDefined();
    expect(document.activeElement).toBe(button("Review"));
  });

  it("stays open and says why when removing fails", async () => {
    const trust = control("trusted", async () => ({ ok: false, reason: "the disk is full" }));
    show(trust.value);
    act(() => button("Remove trust")?.click());
    await act(async () => {
      dialogButton("Remove trust")?.click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    const dialog = document.querySelector("dialog[open]");
    expect(dialog?.textContent).toContain("Couldn't remove trust from Acme: the disk is full.");
  });
});
