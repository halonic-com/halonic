// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmptyState } from "../empty-state/empty-state.tsx";
import { PresentationProvider } from "../presentation/presentation.tsx";
import { click, render, unmountAll } from "../test/render.tsx";
import { SidePanel, type SidePanelProps } from "./side-panel.tsx";

afterEach(() => {
  unmountAll();
});

function panel(overrides: Partial<SidePanelProps> = {}) {
  const { children = <p>Reads each new message and files it.</p>, ...rest } = overrides;
  return (
    <SidePanel title="Sort the inbox" onClose={() => undefined} {...rest}>
      {children}
    </SidePanel>
  );
}

function parts(container: HTMLElement) {
  const aside = container.querySelector("aside");
  const title = container.querySelector("h2");
  if (aside === null || title === null) {
    throw new Error("No panel");
  }
  const [header, body, ...rest] = [...aside.children] as HTMLElement[];
  return { aside, title, header, body, footer: aside.querySelector("footer"), rest };
}

verifies("kit.side-panel", () => {
  it("is a complementary region named by its title, filling its container", () => {
    const { container } = render(panel());
    const { aside, title, header, body } = parts(container);
    expect(aside.getAttribute("aria-labelledby")).toBe(title.id);
    expect(aside.className).toContain("flex h-full min-h-0 flex-col bg-surface");
    expect(aside.className).toContain("border-s border-border");
    expect(aside.className).not.toContain("w-");
    expect(aside.className).not.toMatch(/rounded|shadow/);
    expect(header?.className).toContain("h-12");
    expect(header?.className).toContain("pr-2.5 pl-4");
    expect(header?.className).toContain("border-b border-border");
    expect(title.className).toContain("truncate");
    expect(title.className).toContain("text-section");
    expect(title.getAttribute("tabindex")).toBe("-1");
    expect(title.className).toContain("outline-none");
    expect(body?.className).toContain("min-h-0 flex-1 overflow-y-auto px-4 py-3");
    expect(body?.className).not.toContain("bg-halo-wash");
  });

  it("takes a label that names the region, a side and the halo", () => {
    const { container } = render(panel({ label: "Assistant", halo: true, facing: "end" }));
    const { aside, body } = parts(container);
    expect(aside.getAttribute("aria-label")).toBe("Assistant");
    expect(aside.hasAttribute("aria-labelledby")).toBe(false);
    expect(aside.className).toContain("border-e border-border");
    expect(body?.className).toContain("bg-halo-wash");
  });

  it("puts the shell's actions right of the title and the footer under a divider", () => {
    const { container } = render(
      panel({
        actions: <button type="button">Close Sort the inbox</button>,
        footer: <button type="button">Run step</button>,
      }),
    );
    const { header, footer } = parts(container);
    expect(header?.lastElementChild?.textContent).toBe("Close Sort the inbox");
    expect(footer?.className).toContain(
      "flex h-12 items-center justify-end gap-2 border-t border-border px-4",
    );
    expect(footer?.textContent).toBe("Run step");
  });

  it("shows still skeleton lines while loading, and says so", () => {
    const { container } = render(panel({ loading: "Loading Sort the inbox" }));
    const { body } = parts(container);
    expect(body?.getAttribute("aria-busy")).toBe("true");
    const pairs = [...(body?.firstElementChild?.children ?? [])];
    expect(pairs.length).toBeGreaterThan(0);
    for (const pair of pairs) {
      expect(pair.className).toContain("gap-2");
      expect([...pair.children].map((bar) => bar.className.match(/h-2(\.5)?/)?.[0])).toEqual([
        "h-2.5",
        "h-2",
      ]);
    }
    expect(body?.textContent).toBe("");
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Loading Sort the inbox");
  });

  it("keeps the header working when the body shows an error", () => {
    const { container } = render(
      panel({
        actions: <button type="button">Close Sort the inbox</button>,
        children: <EmptyState tone="error" title="Couldn't load this step" />,
      }),
    );
    expect(parts(container).body?.textContent).toContain("Couldn't load this step");
    expect(container.querySelector("header button")?.textContent).toBe("Close Sort the inbox");
  });

  describe("focus", () => {
    it("moves to the title on open and back to the opener on close", () => {
      const opener = document.createElement("button");
      document.body.append(opener);
      opener.focus();
      const { container, rerender } = render(panel());
      expect(document.activeElement).toBe(parts(container).title);
      rerender(null);
      expect(document.activeElement).toBe(opener);
      opener.remove();
    });

    it("moves to initialFocus when it's there, else to the title", () => {
      const composer = createRef<HTMLTextAreaElement>();
      const { container } = render(
        panel({ initialFocus: composer, children: <textarea ref={composer} /> }),
      );
      expect(document.activeElement).toBe(container.querySelector("textarea"));
      unmountAll();
      const missing = render(panel({ initialFocus: createRef<HTMLElement>() }));
      expect(document.activeElement).toBe(parts(missing.container).title);
    });
  });
});

verifies("kit.side-panel", () => {
  describe("on a phone", () => {
    function phonePanel(overrides: Partial<SidePanelProps> = {}) {
      return <PresentationProvider presentation="phone">{panel(overrides)}</PresentationProvider>;
    }

    it("is a panel sheet: Back at the top left, the title on one line, no side line", async () => {
      const onClose = vi.fn();
      const { container } = render(
        phonePanel({ onClose, footer: <button type="button">Run</button> }),
      );
      const { aside, header, title, footer } = parts(container);
      expect(aside.className).not.toContain("border-s");
      expect(header?.className).toContain("min-h-phone-bar");
      expect(header?.className).toContain("pt-safe");
      const back = header?.firstElementChild;
      expect(back?.getAttribute("aria-label")).toBe("Back");
      expect(title.className).toContain("truncate");
      expect(title.className).toContain("text-heading");
      expect(footer?.className).toContain("pb-safe");
      if (back !== null && back !== undefined) {
        await click(back);
      }
      expect(onClose).toHaveBeenCalledOnce();
    });

    it("ignores initialFocus, so the keyboard doesn't open at once", () => {
      const composer = createRef<HTMLTextAreaElement>();
      const { container } = render(
        phonePanel({ initialFocus: composer, children: <textarea ref={composer} /> }),
      );
      expect(document.activeElement).toBe(parts(container).title);
    });
  });
});
