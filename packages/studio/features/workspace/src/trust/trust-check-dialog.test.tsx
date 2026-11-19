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

/** 60 characters with no space or hyphen to break at, wider than a 320 px window's dialog. */
const longPath = "/workspaces/acmecorporation/integrationsandautomations/local";
const secretName = "ACME_CORPORATION_INTEGRATIONS_AUTOMATIONS_TOKEN";

const review: TrustReview = {
  title: "Trust Local?",
  source: `Local · ${longPath}`,
  changed: false,
  summary: ["Will start 1 program."],
  sections: [
    {
      heading: "Programs (1)",
      open: true,
      rows: [
        {
          id: "files",
          detail: `node ${longPath}/server.js`,
          lines: [["Gets secrets", secretName]],
          warning: undefined,
        },
      ],
    },
  ],
  fingerprint: "hfp1:abc",
  unpinned: [],
  footnote: "Programs you trust run with your access.",
};

/** The innermost element in the open dialog whose own text is exactly `text`. */
function shown(text: string): Element | undefined {
  return [...document.querySelectorAll("dialog[open] *")].find(
    (each) =>
      [...each.childNodes].some((node) => node.nodeType === Node.TEXT_NODE) &&
      each.textContent?.trim() === text,
  );
}

verifies("workspace.trust-check-reflow", () => {
  it("breaks a path or name with nowhere to break anywhere, so the dialog never scrolls sideways", () => {
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

    // jsdom has no layout, so this checks the class that gives `overflow-wrap: anywhere`; Tailwind
    // makes it, and the property is inherited by everything in the dialog's body.
    for (const text of [review.source, secretName]) {
      expect(shown(text)?.closest(".wrap-anywhere"), text).not.toBeNull();
    }
  });
});
