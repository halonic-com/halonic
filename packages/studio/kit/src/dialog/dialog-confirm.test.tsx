// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buttonNamed,
  deleteDialog,
  dialogOf,
  fakeDialogPage,
  fire,
  newAgentDialog,
  restoreDialogPage,
  scrolledIntoView,
} from "../test/dialogs.tsx";
import { click, render, unmountAll } from "../test/render.tsx";

beforeEach(() => {
  fakeDialogPage();
});

afterEach(() => {
  unmountAll();
  restoreDialogPage();
  vi.useRealTimers();
});

verifies("kit.dialog", () => {
  describe("confirming", () => {
    it("runs onConfirm from the confirming button", async () => {
      const onConfirm = vi.fn();
      const { container } = render(deleteDialog({ onConfirm }));
      await click(buttonNamed(container, "Delete agent"));
      expect(onConfirm).toHaveBeenCalledOnce();
    });

    it("submits a form from its confirming button, which is type submit", () => {
      const onConfirm = vi.fn();
      const { container } = render(newAgentDialog({ onConfirm }));
      expect(buttonNamed(container, "Create agent").type).toBe("submit");
      const submit = fire(
        container.querySelector("form") as HTMLFormElement,
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      expect(submit.defaultPrevented).toBe(true);
      expect(onConfirm).toHaveBeenCalledOnce();
    });

    it("ignores a submit while the confirming button is unavailable", () => {
      const onConfirm = vi.fn();
      const { container } = render(
        newAgentDialog({
          onConfirm,
          confirm: {
            label: "Create agent",
            busyLabel: "Creating…",
            unavailable: { reason: "why" },
          },
        }),
      );
      fire(
        container.querySelector("form") as HTMLFormElement,
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });

  describe("busy", () => {
    it("makes the confirming button busy, and Cancel and ✕ unavailable because of it", () => {
      const { container } = render(deleteDialog({ busy: true }));
      const confirm = buttonNamed(container, "Deleting…");
      expect(confirm.getAttribute("aria-busy")).toBe("true");
      const cancel = buttonNamed(container, "Cancel");
      const close = dialogOf(container).querySelector("header button") as HTMLButtonElement;
      for (const button of [cancel, close]) {
        expect(button.getAttribute("aria-disabled")).toBe("true");
        expect(button.getAttribute("aria-describedby")).toBe(confirm.id);
        expect(button.disabled).toBe(false);
      }
    });

    it("ignores Escape, the overlay and Cancel", async () => {
      const onCancel = vi.fn();
      const { container } = render(deleteDialog({ busy: true, onCancel }));
      const dialog = dialogOf(container);
      const escapeKey = fire(dialog, new Event("cancel", { cancelable: true }));
      expect(escapeKey.defaultPrevented).toBe(true);
      fire(dialog, new MouseEvent("pointerdown", { bubbles: true }));
      fire(dialog, new MouseEvent("click", { bubbles: true }));
      await click(buttonNamed(container, "Cancel"));
      expect(onCancel).not.toHaveBeenCalled();
    });
  });
});

verifies("kit.dialog", () => {
  describe("a failed request", () => {
    it("keeps an empty alert slot as the last thing in the body", () => {
      const dialog = dialogOf(render(deleteDialog()).container);
      const slot = dialog.querySelector('[role="alert"]') as HTMLElement;
      expect(slot.childElementCount).toBe(0);
      expect(slot.className).toBe("");
      expect(slot.parentElement?.lastElementChild).toBe(slot);
    });

    it("shows the error as a danger Callout with no role in the slot, and scrolls to it", () => {
      const { container } = render(deleteDialog({ error: "Couldn't delete Sorter." }));
      const slot = dialogOf(container).querySelector('[role="alert"]') as HTMLElement;
      expect(slot.textContent).toBe("Couldn't delete Sorter.");
      expect(slot.querySelector(".bg-danger-soft")?.hasAttribute("role")).toBe(false);
      expect(scrolledIntoView).toContainEqual({ block: "nearest" });
    });

    it("empties the slot on each attempt and fills it again a frame after, same words or not", async () => {
      vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
      const error = "Couldn't delete Sorter.";
      const { container, rerender } = render(deleteDialog({ error }));
      const slot = () => dialogOf(container).querySelector('[role="alert"]') as HTMLElement;
      await click(buttonNamed(container, "Delete agent"));
      rerender(deleteDialog({ error, busy: true }));
      expect(slot().textContent).toBe("");
      rerender(deleteDialog({ error }));
      expect(slot().textContent).toBe("");
      act(() => {
        vi.advanceTimersToNextFrame();
      });
      expect(slot().textContent).toBe(error);
    });

    it("keeps focus on the confirming button", () => {
      const { container, rerender } = render(deleteDialog());
      const confirm = buttonNamed(container, "Delete agent");
      confirm.focus();
      rerender(deleteDialog({ error: "Couldn't delete Sorter." }));
      expect(document.activeElement).toBe(confirm);
    });
  });
});
