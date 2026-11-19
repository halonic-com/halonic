// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act, type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { click, render, unmountAll } from "../test/render.tsx";
import { Callout } from "./callout.tsx";

afterEach(() => {
  unmountAll();
});

const STRIP = "Writer can't run until Codex is installed.";

/** The Harness page's strip: a polite Callout that's always on the page, with Check again. */
function renderStrip(text: ReactNode, onClick: () => void | Promise<void> = vi.fn()) {
  const strip = (next: ReactNode) => (
    <Callout
      tone="warning"
      announce="polite"
      action={{ label: "Check again", busyLabel: "Checking…", onClick }}
    >
      {next}
    </Callout>
  );
  const { container, rerender } = render(strip(text));
  const region = () => container.querySelector('[role="status"]') as HTMLElement;
  const button = () => container.querySelector("button");
  return { container, region, button, setText: (next: ReactNode) => rerender(strip(next)) };
}

verifies("kit.callout-polite", () => {
  it("puts the words in an atomic status region that was there before them, and the action after it", () => {
    const { container, region, button, setText } = renderStrip(null);
    const before = region();
    expect(before.getAttribute("aria-atomic")).toBe("true");
    setText(STRIP);
    expect(region()).toBe(before);
    expect(before.textContent).toBe(STRIP);
    expect(before.contains(button())).toBe(false);
    expect(before.compareDocumentPosition(button() as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(container.querySelector("[tabindex]")).toBeNull();
  });

  it("keeps the title and the files in the region with the text", () => {
    const { container } = render(
      <Callout
        tone="warning"
        title="Couldn't change 2 files"
        files={["README.md", "notes/plan.md"]}
        announce="polite"
      >
        Halonic kept a copy of each.
      </Callout>,
    );
    const region = container.querySelector('[role="status"]') as HTMLElement;
    expect(region.textContent).toBe(
      "Couldn't change 2 filesHalonic kept a copy of each.README.mdnotes/plan.md",
    );
  });

  it("draws the tone's box and icon round the region and the action while it has words", () => {
    const { container, region } = renderStrip(STRIP);
    const box = container.firstElementChild as HTMLElement;
    expect(box.className).toContain("rounded-sm border border-transparent p-3 bg-warning-soft");
    expect(box.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
    expect(box.contains(region())).toBe(true);
  });

  it.each([null, false, "", undefined])(
    "with %o as its text, draws nothing but the empty region",
    (empty) => {
      const { container, region, button, setText } = renderStrip(STRIP);
      const kept = region();
      setText(empty);
      expect(region()).toBe(kept);
      expect(kept.textContent).toBe("");
      expect(button()).toBeNull();
      expect(container.querySelector("svg")).toBeNull();
      expect(container.querySelector("[class]")).toBeNull();
    },
  );

  it("keeps the action busy outside the region while its promise runs", async () => {
    let finish = () => {};
    const check = () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      });
    const { region, button } = renderStrip(STRIP, check);
    await click(button() as HTMLButtonElement);
    expect(button()?.getAttribute("aria-busy")).toBe("true");
    expect(button()?.textContent).toContain("Checking…");
    expect(region().textContent).toBe(STRIP);
    await act(async () => finish());
    expect(button()?.hasAttribute("aria-busy")).toBe(false);
  });
});
