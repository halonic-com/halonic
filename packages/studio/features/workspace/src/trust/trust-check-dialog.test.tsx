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

verifies("workspace.trust-check-lines", () => {
  it("puts a colon after a line's label, so the label and its text read apart", () => {
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

    expect(shown(`Gets secrets: ${secretName}`)).toBeDefined();
  });
});

verifies("workspace.trust-check-unlabelled-lines", () => {
  const integrations: TrustReview = {
    ...review,
    sections: [
      {
        heading: "Integrations (1)",
        open: true,
        rows: [
          {
            id: "home-station",
            detail: "",
            lines: [
              ["Runs", "Doesn't start on this computer.", "attention"],
              ["", "The reason."],
              ["Reaches", "a.example"],
              ["", "b.example"],
            ],
          },
        ],
      },
    ],
  };

  function open() {
    act(() =>
      root.render(
        <TrustCheckDialog
          review={integrations}
          shown={integrations.fingerprint}
          busy={false}
          error={undefined}
          onNotNow={() => {}}
          onTrust={() => {}}
          returnFocus={() => null}
        />,
      ),
    );
  }

  it("a line without a label has no colon, and its value sits in the value column", () => {
    open();

    expect(shown("Reaches: a.example")).toBeDefined();
    const second = shown("b.example");
    expect(second?.textContent).not.toMatch(/:/u);
    // jsdom has no layout: the value column is the grid's second column, as the first value's.
    expect(second?.classList.contains("col-start-2")).toBe(true);
    expect(shown("a.example")?.classList.contains("col-start-2")).toBe(true);
  });

  it("shows a line in the attention tone in amber, and only that line", () => {
    open();

    expect(shown("Doesn't start on this computer.")?.classList.contains("text-attention")).toBe(
      true,
    );
    expect(shown("The reason.")?.classList.contains("text-attention")).toBe(false);
  });
});

verifies("workspace.trust-check-escaped", () => {
  it("shows control and bidi characters in a row as their visible codes", () => {
    const outside: TrustReview = {
      ...review,
      title: "Trust Ac\u202eme?",
      sections: [
        {
          heading: "Programs (1)",
          open: true,
          rows: [
            {
              id: "fi\u0007les",
              detail: "node \u202esj.elif",
              lines: [["Environment", "NOTE=a\u001bb"]],
              warning: "Can download new code from npm\u2066 when it starts: version not pinned.",
            },
          ],
        },
      ],
    };
    act(() =>
      root.render(
        <TrustCheckDialog
          review={outside}
          shown={outside.fingerprint}
          busy={false}
          error={undefined}
          onNotNow={() => {}}
          onTrust={() => {}}
          returnFocus={() => null}
        />,
      ),
    );

    expect(shown("fi\\u0007les")).toBeDefined();
    expect(shown("node \\u202esj.elif")).toBeDefined();
    expect(shown("NOTE=a\\u001bb")).toBeDefined();
    const text = document.querySelector("dialog[open]")?.textContent ?? "";
    expect(text).toContain("Trust Ac\\u202eme?");
    expect(text).toContain("npm\\u2066 when");
    for (const unsafe of ["\u0007", "\u001b", "\u202e", "\u2066"]) {
      expect(text).not.toContain(unsafe);
    }
  });
});
