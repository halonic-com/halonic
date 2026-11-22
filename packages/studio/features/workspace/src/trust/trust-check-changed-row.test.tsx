// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { TrustCheckDialog } from "./trust-check-dialog.tsx";
import type { TrustReview } from "./workspace-trust-control.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let element: HTMLElement;
let root: Root;

beforeEach(() => {
  // jsdom has no <dialog> methods.
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
  element = document.createElement("div");
  document.body.append(element);
  root = createRoot(element);
});

afterEach(() => {
  act(() => root.unmount());
  element.remove();
});

const review: TrustReview = {
  title: "Acme changed since you trusted it on 3 Nov",
  source: "/work/acme",
  changed: true,
  summary: ["1 changed program since you trusted this on 3 Nov."],
  sections: [
    {
      heading: "Programs",
      open: true,
      rows: [
        {
          id: "mail-mcp",
          tag: "Changed",
          detail: "npx @acme/mail-mcp 2.4.0",
          detailWas: "npx @acme/mail-mcp 2.3.1",
          lines: [
            ["Working folder", "tools", "code"],
            ["Environment", "LOG_LEVEL=debug", "code", "added"],
            ["", "NODE_OPTIONS=--require ./b.js", "code", { was: "NODE_OPTIONS=--require ./a.js" }],
          ],
        },
      ],
    },
  ],
  fingerprint: "hfp1:abc",
  unpinned: [],
  footnote: "Programs you trust run with your access.",
};

function render() {
  act(() =>
    root.render(
      <TrustCheckDialog
        review={review}
        shown={review.fingerprint}
        busy={false}
        error={undefined}
        onNotNow={() => {}}
        onTrust={() => {}}
        returnFocus={() => null}
      />,
    ),
  );
}

/** The element in the open dialog whose whole text, read as a screen reader does, is `text`. */
function heard(text: string): Element | undefined {
  return [...document.querySelectorAll("dialog[open] span")].find(
    (each) => spoken(each).trim() === text,
  );
}

/** An element's text without what's hidden from screen readers. */
function spoken(node: Node): string {
  if (node instanceof Element && node.getAttribute("aria-hidden") === "true") return "";
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  return [...node.childNodes].map(spoken).join("");
}

verifies("studio.trust-review-program-changes", () => {
  it("shows a changed value as old → new: old muted, the arrow subtle, new in weight 500", () => {
    render();

    const line = heard("was NODE_OPTIONS=--require ./a.js, now NODE_OPTIONS=--require ./b.js");
    expect(line?.textContent).toBe(
      "was NODE_OPTIONS=--require ./a.js, now  → NODE_OPTIONS=--require ./b.js",
    );
    expect(line?.className).toContain("font-mono");
    const parts = [...(line?.children ?? [])];
    expect(parts.map((part) => part.className)).toEqual([
      "text-fg-muted",
      "sr-only",
      "text-fg-subtle",
      "font-medium text-fg",
    ]);
    expect(parts[2]?.getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelector("dialog[open] s, dialog[open] del, .line-through")).toBeNull();
  });

  it("shows the old command before the new one", () => {
    render();

    expect(heard("was npx @acme/mail-mcp 2.3.1, now npx @acme/mail-mcp 2.4.0")).toBeDefined();
  });

  it("marks a new value in weight 500, and leaves an unchanged one as it is", () => {
    render();

    const added = heard("new: LOG_LEVEL=debug");
    expect(added?.className).toContain("font-mono");
    expect(added?.firstElementChild?.className).toBe("font-medium text-fg");
    expect(added?.firstElementChild?.textContent).toBe("new: LOG_LEVEL=debug");
    expect(heard("tools")?.className).toBe("col-start-2 @max-[24rem]:col-start-1 font-mono");
    expect(heard("tools")?.querySelector(".font-medium, .sr-only")).toBeNull();
  });
});
