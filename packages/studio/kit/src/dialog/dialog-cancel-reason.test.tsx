// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buttonNamed,
  deleteDialog,
  dialogOf,
  fakeDialogPage,
  fire,
  restoreDialogPage,
} from "../test/dialogs.tsx";
import { click, render, unmountAll } from "../test/render.tsx";

beforeEach(() => {
  fakeDialogPage();
});

afterEach(() => {
  unmountAll();
  restoreDialogPage();
});

verifies("kit.dialog-cancel-reason", () => {
  describe("the reason onCancel gets", () => {
    it("is button for the footer's Cancel button, under any label", async () => {
      const onCancel = vi.fn();
      const { container } = render(deleteDialog({ cancelLabel: "Approve none", onCancel }));
      await click(buttonNamed(container, "Approve none"));
      expect(onCancel).toHaveBeenCalledExactlyOnceWith("button");
    });

    it("is dismiss for Escape", () => {
      const onCancel = vi.fn();
      const { container } = render(deleteDialog({ onCancel }));
      fire(dialogOf(container), new Event("cancel", { cancelable: true }));
      expect(onCancel).toHaveBeenCalledExactlyOnceWith("dismiss");
    });

    it("is dismiss for the ✕", async () => {
      const onCancel = vi.fn();
      const { container } = render(deleteDialog({ onCancel }));
      await click(buttonNamed(container, "Close Delete agent"));
      expect(onCancel).toHaveBeenCalledExactlyOnceWith("dismiss");
    });

    it("is dismiss when the browser closes the dialog anyway", () => {
      const onCancel = vi.fn();
      const { container } = render(deleteDialog({ onCancel }));
      const dialog = dialogOf(container);
      dialog.removeAttribute("open");
      fire(dialog, new Event("close"));
      expect(onCancel).toHaveBeenCalledExactlyOnceWith("dismiss");
    });
  });
});
