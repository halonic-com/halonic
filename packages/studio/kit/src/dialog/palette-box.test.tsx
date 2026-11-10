// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCss } from "../test/build-css.spec.ts";
import { dialogOf, fakeDialogPage, fire, restoreDialogPage } from "../test/dialogs.tsx";
import { render, unmountAll } from "../test/render.tsx";
import type { ModalLiveRegions } from "./modal-regions.tsx";
import { ModalRegionsProvider } from "./modal-regions.tsx";
import { PaletteBox } from "./palette-box.tsx";

beforeEach(() => {
  fakeDialogPage();
});

afterEach(() => {
  unmountAll();
  restoreDialogPage();
});

function Palette({ open, onCancel = () => undefined }: { open: boolean; onCancel?: () => void }) {
  return (
    <>
      <button type="button">Search</button>
      {open ? (
        <PaletteBox
          label="Search"
          initialFocus={() => document.querySelector<HTMLElement>("input")}
          onCancel={onCancel}
        >
          <input aria-label="Search" />
          <p>Open tabs</p>
        </PaletteBox>
      ) : null}
    </>
  );
}

function pressOverlay(dialog: HTMLDialogElement) {
  fire(dialog, new MouseEvent("pointerdown", { bubbles: true }));
  fire(dialog, new MouseEvent("click", { bubbles: true }));
}

verifies("kit.palette-box", () => {
  it("opens as a modal named Search, with focus in the box", () => {
    const { container } = render(<Palette open />);
    const dialog = dialogOf(container);
    expect(dialog.open).toBe(true);
    expect(dialog.getAttribute("aria-label")).toBe("Search");
    expect(document.activeElement?.tagName).toBe("INPUT");
  });

  it("draws a 600px raised box 96px from the top, over the overlay, that fades in", () => {
    const classes = dialogOf(render(<Palette open />).container).className.split(" ");
    for (const name of [
      "palette-frame",
      "w-palette",
      "rounded-lg",
      "bg-surface-raised",
      "shadow-3",
      "open:flex",
      "starting:opacity-0",
      "backdrop:bg-overlay",
    ]) {
      expect(classes).toContain(name);
    }
  });

  it("places the frame from the palette token, inside the window's limits", async () => {
    const css = await buildCss(["w-palette", "palette-frame"]);
    expect(css).toContain("width: var(--container-palette)");
    expect(css).toContain("--container-palette: 600px");
    expect(css).toContain("margin: 96px auto auto");
    expect(css).toContain("max-width: calc(100vw - 32px)");
    expect(css).toContain("max-height: calc(100dvh - 192px)");
  });

  describe("closing", () => {
    it("cancels on Escape and doesn't close by itself", () => {
      const onCancel = vi.fn();
      const dialog = dialogOf(render(<Palette open onCancel={onCancel} />).container);
      const escapeKey = fire(dialog, new Event("cancel", { cancelable: true }));
      expect(escapeKey.defaultPrevented).toBe(true);
      expect(onCancel).toHaveBeenCalledOnce();
      expect(dialog.open).toBe(true);
    });

    it("cancels on a click on the overlay, also after typing", () => {
      const onCancel = vi.fn();
      const dialog = dialogOf(render(<Palette open onCancel={onCancel} />).container);
      fire(dialog.querySelector("input") as HTMLElement, new Event("input", { bubbles: true }));
      pressOverlay(dialog);
      expect(onCancel).toHaveBeenCalledOnce();
    });

    it("doesn't cancel on a click inside the box", () => {
      const onCancel = vi.fn();
      const dialog = dialogOf(render(<Palette open onCancel={onCancel} />).container);
      const text = dialog.querySelector("p") as HTMLElement;
      fire(text, new MouseEvent("pointerdown", { bubbles: true }));
      fire(text, new MouseEvent("click", { bubbles: true }));
      expect(onCancel).not.toHaveBeenCalled();
    });

    it("gives focus back to the opener when the screen unmounts it", () => {
      const { container, rerender } = render(<Palette open={false} />);
      const opener = container.querySelector("button") as HTMLButtonElement;
      opener.focus();
      rerender(<Palette open />);
      rerender(<Palette open={false} />);
      expect(document.activeElement).toBe(opener);
    });
  });

  it("gives its live regions to the announcer while open", () => {
    const stack: ModalLiveRegions[] = [];
    const push = (regions: ModalLiveRegions) => {
      stack.push(regions);
      return () => {
        stack.splice(stack.indexOf(regions), 1);
      };
    };
    const tree = (open: boolean) => (
      <ModalRegionsProvider pushModalRegions={push}>
        <Palette open={open} />
      </ModalRegionsProvider>
    );
    const { container, rerender } = render(tree(true));
    expect(stack).toHaveLength(1);
    expect(dialogOf(container).querySelector(':scope > [aria-live="polite"]')).not.toBeNull();
    rerender(tree(false));
    expect(stack).toHaveLength(0);
  });
});
