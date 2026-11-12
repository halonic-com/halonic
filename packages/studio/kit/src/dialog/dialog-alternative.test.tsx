// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buttonNamed,
  deleteDialog,
  dialogOf,
  fakeDialogPage,
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

/** The names of the footer's buttons, in order. */
function footerButtons(container: HTMLElement): string[] {
  const footer = dialogOf(container).querySelector("footer");
  return [...(footer?.querySelectorAll("button") ?? [])].map((button) => button.textContent ?? "");
}

verifies("kit.dialog-alternative", () => {
  describe("an alternative", () => {
    it("sits between Cancel and the confirming button", () => {
      const { container } = render(
        deleteDialog({ alternative: { label: "Close anyway", onClick: () => undefined } }),
      );
      expect(footerButtons(container)).toEqual(["Cancel", "Close anyway", "Delete agentDeleting…"]);
    });

    it("runs its own onClick, not onConfirm", async () => {
      const onClick = vi.fn();
      const onConfirm = vi.fn();
      const { container } = render(
        deleteDialog({ alternative: { label: "Close anyway", onClick }, onConfirm }),
      );
      await click(buttonNamed(container, "Close anyway"));
      expect(onClick).toHaveBeenCalledOnce();
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it("does nothing while the Dialog is busy", async () => {
      const onClick = vi.fn();
      const { container } = render(
        deleteDialog({ alternative: { label: "Close anyway", onClick }, busy: true }),
      );
      await click(buttonNamed(container, "Close anyway"));
      expect(onClick).not.toHaveBeenCalled();
    });

    it("is left out when there is none", () => {
      const { container } = render(deleteDialog());
      expect(footerButtons(container)).toEqual(["Cancel", "Delete agentDeleting…"]);
    });
  });
});
