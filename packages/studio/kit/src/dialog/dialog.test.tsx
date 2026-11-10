// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PresentationProvider } from "../presentation/presentation.tsx";
import {
  buttonNamed,
  deleteDialog,
  dialogOf,
  fakeDialogPage,
  fire,
  footerNames,
  newAgentDialog,
  restoreDialogPage,
} from "../test/dialogs.tsx";
import { click, render, unmountAll } from "../test/render.tsx";
import { Dialog } from "./dialog.tsx";

function formDialog(fields: ReactNode) {
  return (
    <Dialog
      title="New agent"
      form
      confirm={{ label: "Create agent", busyLabel: "Creating…" }}
      onConfirm={() => undefined}
      onCancel={() => undefined}
    >
      {fields}
    </Dialog>
  );
}

beforeEach(() => {
  fakeDialogPage();
});

afterEach(() => {
  unmountAll();
  restoreDialogPage();
  vi.useRealTimers();
});

verifies("kit.dialog", () => {
  it("opens as a modal when it mounts, named by its title and described by its text", () => {
    const { container } = render(deleteDialog());
    const dialog = dialogOf(container);
    expect(dialog.open).toBe(true);
    const title = document.getElementById(dialog.getAttribute("aria-labelledby") ?? "");
    expect(title?.tagName).toBe("H2");
    expect(title?.textContent).toBe("Delete agent?");
    expect(title?.className).toContain("text-heading");
    const body = document.getElementById(dialog.getAttribute("aria-describedby") ?? "");
    expect(body?.textContent).toContain("Sorter and its history are deleted");
    expect(body?.className).toContain("px-6 pt-1 pb-4 text-body text-fg-muted");
  });

  it("draws a 16px-radius raised box over the overlay that fades in", () => {
    const dialog = dialogOf(render(deleteDialog()).container);
    for (const part of [
      "dialog-frame",
      "rounded-lg",
      "bg-surface-raised",
      "shadow-3",
      "border-transparent",
      "open:flex",
      "starting:opacity-0",
      "backdrop:bg-overlay",
    ]) {
      expect(dialog.className).toContain(part);
    }
    expect(dialog.className).not.toMatch(/scale|blur/);
  });

  it.each([
    ["sm", "w-dialog-sm"],
    ["md", "w-dialog-md"],
    ["lg", "w-dialog-lg"],
  ] as const)("is %s wide with %s", (size, width) => {
    const dialog = dialogOf(render(deleteDialog({ size })).container);
    expect(dialog.className).toContain(width);
  });

  it("keeps a fixed height when given one, on desktop only", () => {
    const desktop = dialogOf(render(deleteDialog({ height: 640 })).container);
    expect(desktop.className).toContain("dialog-height");
    expect(desktop.style.getPropertyValue("--dialog-height")).toBe("640px");
    unmountAll();
    const phone = dialogOf(
      render(
        <PresentationProvider presentation="phone">
          {deleteDialog({ height: 640 })}
        </PresentationProvider>,
      ).container,
    );
    expect(phone.className).not.toContain("dialog-height");
    expect(phone.style.getPropertyValue("--dialog-height")).toBe("");
  });

  it("lets the header scroll with the body when the window is short, but not the footer", () => {
    const dialog = dialogOf(render(deleteDialog()).container);
    const scroller = dialog.querySelector("header")?.parentElement as HTMLElement;
    expect(scroller.className).toContain("short:overflow-y-auto");
    expect(dialog.querySelector("footer")?.parentElement).toBe(dialog);
  });

  it("puts a line under the header and no padding round a flush body", () => {
    const dialog = dialogOf(render(deleteDialog({ flush: true })).container);
    expect(dialog.querySelector("header")?.className).toContain("border-b");
    expect(dialog.querySelector("header + div")?.className).not.toContain("px-6");
    expect(dialog.hasAttribute("aria-describedby")).toBe(false);
  });

  it("starts on Cancel in a confirmation, the least destructive button", () => {
    const { container } = render(deleteDialog());
    expect(document.activeElement).toBe(buttonNamed(container, "Cancel"));
  });

  it("starts on the first field in a form", () => {
    const { container } = render(newAgentDialog());
    expect(document.activeElement).toBe(container.querySelector("input"));
  });

  it("skips a disabled field and one inside something hidden", () => {
    const { container } = render(
      formDialog(
        <>
          <input name="id" disabled />
          <div hidden>
            <input name="advanced" />
          </div>
          <textarea name="description" />
        </>,
      ),
    );
    expect(document.activeElement).toBe(container.querySelector("textarea"));
  });

  it("starts on Cancel in a form with no field to take focus", () => {
    const { container } = render(formDialog(<input name="id" disabled />));
    expect(document.activeElement).toBe(buttonNamed(container, "Cancel"));
  });

  it("fades the box and the overlay in with the enter easing", () => {
    const dialog = dialogOf(render(deleteDialog()).container);
    expect(dialog.className).toContain(" ease-(--ease-enter)");
    expect(dialog.className).toContain("backdrop:ease-(--ease-enter)");
  });
});

verifies("kit.dialog", () => {
  describe("footer", () => {
    it("puts Cancel then the confirming button on the right on desktop", () => {
      const { container } = render(deleteDialog());
      expect(footerNames(container)).toEqual(["Cancel", "Delete agent"]);
      expect(dialogOf(container).querySelector("footer")?.className).toContain("justify-end");
      expect(buttonNamed(container, "Delete agent").className).toContain("bg-danger");
      expect(buttonNamed(container, "Cancel").className).toContain("text-fg-muted");
    });

    it("stacks full-width 48px buttons on a phone, the confirming one first, with no ✕", () => {
      const { container } = render(
        <PresentationProvider presentation="phone">{deleteDialog()}</PresentationProvider>,
      );
      expect(footerNames(container)).toEqual(["Delete agent", "Cancel"]);
      expect(dialogOf(container).querySelector("footer")?.className).toContain("flex-col");
      for (const name of ["Delete agent", "Cancel"]) {
        expect(buttonNamed(container, name).className).toContain("min-h-touch");
        expect(buttonNamed(container, name).className).toContain("w-full");
      }
      expect(dialogOf(container).querySelector("header button")).toBeNull();
    });

    it("says Not now when that's what cancelling does", () => {
      const { container } = render(deleteDialog({ cancelLabel: "Not now" }));
      expect(footerNames(container)).toEqual(["Not now", "Delete agent"]);
    });
  });

  describe("close button", () => {
    it("names what it closes", () => {
      const onCancel = vi.fn();
      const { container } = render(deleteDialog({ onCancel }));
      const close = dialogOf(container).querySelector("header button") as HTMLButtonElement;
      expect(close.getAttribute("aria-label")).toBe("Close Delete agent");
      return click(close).then(() => expect(onCancel).toHaveBeenCalledOnce());
    });

    it("keeps the title's words but drops only a trailing question mark", () => {
      const { container } = render(deleteDialog({ title: "Why? Delete agent" }));
      expect(dialogOf(container).querySelector("header button")?.getAttribute("aria-label")).toBe(
        "Close Why? Delete agent",
      );
    });

    it("takes another name, and goes when closeButton is false", () => {
      const named = render(deleteDialog({ closeLabel: "Close trust check" }));
      expect(
        dialogOf(named.container).querySelector("header button")?.getAttribute("aria-label"),
      ).toBe("Close trust check");
      unmountAll();
      const without = render(deleteDialog({ closeButton: false }));
      expect(dialogOf(without.container).querySelector("header button")).toBeNull();
    });
  });

  describe("cancelling", () => {
    it("runs the same handler for Escape as for Cancel, and doesn't close by itself", () => {
      const onCancel = vi.fn();
      const dialog = dialogOf(render(deleteDialog({ onCancel })).container);
      const escapeKey = fire(dialog, new Event("cancel", { cancelable: true }));
      expect(escapeKey.defaultPrevented).toBe(true);
      expect(onCancel).toHaveBeenCalledOnce();
      expect(dialog.open).toBe(true);
    });

    it("cancels on a click on the overlay until something is typed", () => {
      const onCancel = vi.fn();
      const dialog = dialogOf(render(newAgentDialog({ onCancel })).container);
      const pressOverlay = () => {
        fire(dialog, new MouseEvent("pointerdown", { bubbles: true }));
        fire(dialog, new MouseEvent("click", { bubbles: true }));
      };
      pressOverlay();
      expect(onCancel).toHaveBeenCalledOnce();
      fire(
        dialog.querySelector("input") as HTMLInputElement,
        new Event("input", { bubbles: true }),
      );
      pressOverlay();
      expect(onCancel).toHaveBeenCalledOnce();
    });

    it("doesn't cancel when a press starts inside the box and ends on the overlay", () => {
      const onCancel = vi.fn();
      const dialog = dialogOf(render(deleteDialog({ onCancel })).container);
      fire(
        dialog.querySelector("h2") as HTMLElement,
        new MouseEvent("pointerdown", { bubbles: true }),
      );
      fire(dialog, new MouseEvent("click", { bubbles: true }));
      expect(onCancel).not.toHaveBeenCalled();
    });

    it("tells the screen when the browser closed it anyway", () => {
      const onCancel = vi.fn();
      const dialog = dialogOf(render(deleteDialog({ busy: true, onCancel })).container);
      dialog.removeAttribute("open");
      fire(dialog, new Event("close"));
      expect(onCancel).toHaveBeenCalledOnce();
    });
  });
});
