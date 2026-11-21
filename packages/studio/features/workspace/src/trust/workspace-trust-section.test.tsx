// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { ClipboardProvider, createToastStore, type ToastStore } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
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
  vi.useRealTimers();
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
  let retried = 0;
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
    failure: current === "failed" ? "the folder isn't there any more" : undefined,
    retry: async () => {
      retried += 1;
    },
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
  return { value, removed: () => removed, retried: () => retried };
}

function show(
  trust: WorkspaceTrustControl,
  toasts: ToastStore = createToastStore(),
  writeClipboard = async (_text: string) => true,
) {
  root = createRoot(element);
  act(() => {
    root?.render(
      createElement(ClipboardProvider, {
        writeClipboard,
        children: createElement(WorkspaceTrustSection, { trust, name: "Acme", toasts }),
      }),
    );
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
  it("says it is loading before the first check", () => {
    show(control("unknown").value);
    expect(element.querySelector("h2")?.textContent).toBe("Trust");
    expect(element.textContent).toContain("Loading workspace settings");
    expect(button("Review")).toBeUndefined();
    expect(button("Remove trust")).toBeUndefined();
  });

  it("says why the check failed and runs it again from Try again", () => {
    const trust = control("failed");
    show(trust.value);
    expect(element.textContent).toContain(
      "Couldn't load workspace settings · the folder isn't there any more",
    );
    act(() => button("Try again")?.click());
    expect(trust.retried()).toBe(1);
  });

  it("says when a trusted workspace was trusted and offers Remove trust", () => {
    show(control("trusted").value);
    expect(element.textContent).toContain("Trusted on 3 Nov 2026");
    expect(button("Remove trust")).toBeDefined();
    expect(button("Review")).toBeUndefined();
  });

  it("says there is nothing to trust, with no Review, for a workspace that holds nothing (HAL-10131)", () => {
    const { value } = control("not-trusted");
    show({ ...value, needsNoTrust: true });

    expect(document.body.textContent).toContain("Nothing to trust here.");
    expect(button("Review")).toBeUndefined();
  });

  it("says there is nothing to trust, with no Review changes, when the record reads changed (HAL-11850)", () => {
    const { value } = control("changed");
    show({ ...value, needsNoTrust: true });

    expect(document.body.textContent).toContain("Nothing to trust here.");
    expect(button("Review changes")).toBeUndefined();
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
    expect(dialog?.textContent).toContain(
      "Halonic will ask again before running anything from this workspace, and runs in progress stop.",
    );
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
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    const trust = control("trusted", async () => ({ ok: false, reason: "the disk is full" }));
    show(trust.value);
    act(() => button("Remove trust")?.click());
    await act(async () => {
      dialogButton("Remove trust")?.click();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    const dialog = document.querySelector("dialog[open]");
    expect(dialog?.textContent).toContain("Couldn't remove trust from Acme: the disk is full.");
  });

  it("words an internal error as Trusted sources does, with Copy details that confirms in place (C529-4)", async () => {
    vi.useFakeTimers();
    const writeClipboard = vi.fn(async (_text: string) => true);
    const internal = new KindedError(
      "internal",
      "The trust store refused the call: location is not absolute.",
    );
    const declined = new KindedError("denied", "Halonic can't change the trust store right now");
    const results = [internal, declined].map(
      (error): TrustGrantResult => ({ ok: false, reason: error.message, error }),
    );
    const trust = control("trusted", async () => results.shift() ?? { ok: true });
    show(trust.value, createToastStore(), writeClipboard);
    act(() => button("Remove trust")?.click());
    const confirm = async () => {
      await act(async () => dialogButton("Remove trust")?.click());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });
      return document.querySelector("dialog[open]");
    };

    const dialog = await confirm();
    expect(dialog?.textContent).toContain(
      "Couldn't remove trust from Acme: Halonic ran into a problem it can't explain yet.",
    );
    expect(dialog?.textContent).not.toContain("location is not absolute");
    await act(async () => dialogButton("Copy details")?.click());
    expect(writeClipboard).toHaveBeenCalledWith(
      expect.stringMatching(/^Couldn't remove trust from Acme: .*\n.*location is not absolute/su),
    );
    expect(dialogButton("Copied")).toBeDefined();

    // A refusal that names the problem keeps its words, and has no details to copy.
    const again = await confirm();
    expect(again?.textContent).toContain(
      "Couldn't remove trust from Acme: Halonic can't change the trust store right now.",
    );
    expect(dialogButton("Copy details")).toBeUndefined();
    expect(dialogButton("Copied")).toBeUndefined();
  });
});
