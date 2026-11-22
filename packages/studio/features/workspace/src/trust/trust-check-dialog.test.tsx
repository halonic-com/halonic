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
  it("shows hidden characters in a row as amber markers", () => {
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
              lines: [
                ["Environment", "NOTE=a\u001bb"],
                ["", "GREETING=hi\u200bthere"],
                ["", "LINES=a\nb"],
              ],
              warning: "Can download new code from npm\u2066 when it starts: version not pinned.",
            },
          ],
        },
      ],
    };
    openWith(outside);

    expect(shown("fi⟦U+0007⟧les")).toBeDefined();
    expect(shown("node ⟦U+202E⟧sj.elif")).toBeDefined();
    expect(shown("NOTE=a⟦U+001B⟧b")).toBeDefined();
    expect(shown("GREETING=hi⟦U+200B⟧there")).toBeDefined();
    expect(shown("LINES=a⟦U+000A⟧b")).toBeDefined();
    expect(shown("⟦U+202E⟧")?.classList.contains("text-attention")).toBe(true);
    const text = document.querySelector("dialog[open]")?.textContent ?? "";
    expect(text).toContain("Trust Ac⟦U+202E⟧me?");
    expect(text).toContain("npm⟦U+2066⟧ when");
    for (const unsafe of ["\u0007", "\u001b", "\u202e", "\u2066", "\u200b", "\n"]) {
      expect(text).not.toContain(unsafe);
    }
  });
});

const program: TrustReview = {
  ...review,
  sections: [
    {
      heading: "Programs (1)",
      open: true,
      rows: [
        {
          id: "files",
          detail: "node files.js",
          lines: [
            ["Takes from your environment", "PATH", "code"],
            ["Runs", "/usr/local/bin/node", "code"],
            ["Gets secrets", secretName],
          ],
        },
      ],
    },
  ],
};

verifies("workspace.trust-check-narrow-lines", () => {
  it("puts each label over its value below 24rem, and beside it above", () => {
    openWith(program);

    // jsdom has no layout: below the row's 24rem the grid has one column, and each value moves
    // from the second column to the first, under its label.
    const grid = shown("/usr/local/bin/node")?.closest(".grid-cols-\\[auto_1fr\\]");
    expect(grid?.closest(".\\@container")).not.toBeNull();
    expect(grid?.className.split(" ")).toContain("@max-[24rem]:grid-cols-1");
    const value = shown("/usr/local/bin/node");
    expect(value?.className.split(" ")).toEqual(
      expect.arrayContaining(["col-start-2", "@max-[24rem]:col-start-1"]),
    );
    expect(value?.parentElement?.className.split(" ")).toEqual(
      expect.arrayContaining(["col-span-2", "@max-[24rem]:col-span-1"]),
    );
  });
});

verifies("workspace.trust-check-code-lines", () => {
  it("shows a code value in mono and its label in the text font", () => {
    openWith(program);

    expect(shown("/usr/local/bin/node")?.classList.contains("font-mono")).toBe(true);
    expect(shown("PATH")?.classList.contains("font-mono")).toBe(true);
    expect(shown("Runs:")?.closest(".font-mono")).toBeNull();
    expect(shown(secretName)?.classList.contains("font-mono")).toBe(false);
  });
});

function openWith(shownReview: TrustReview) {
  act(() =>
    root.render(
      <TrustCheckDialog
        review={shownReview}
        shown={shownReview.fingerprint}
        busy={false}
        error={undefined}
        onNotNow={() => {}}
        onTrust={() => {}}
        returnFocus={() => null}
      />,
    ),
  );
}
