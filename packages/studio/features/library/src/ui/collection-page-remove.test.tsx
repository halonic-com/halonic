// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { opened, pressButton, pressConfirm, sourceOf, swim } from "./collection-page.fixture.tsx";

verifies("library.collection-page", () => {
  describe("CollectionPage remove", () => {
    it("asks before removing a record, and removes it on Remove", async () => {
      const remove = vi.fn(async () => {});
      const { root } = await opened(sourceOf([swim]), undefined, { remove });
      await pressButton(root, "Remove");
      expect(root.ownerDocument.body.textContent).toContain("Remove swim-oct?");
      expect(remove).not.toHaveBeenCalled();
      // The menu's Remove comes first; the dialog's is the last one.
      const confirm = [...root.ownerDocument.querySelectorAll("button")]
        .filter((each) => each.textContent?.startsWith("Remove"))
        .at(-1);
      await act(async () => {
        (confirm as HTMLElement).click();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(remove).toHaveBeenCalledWith({ hub: null, id: "claims" }, "swim-oct");
    });
    it("keeps Remove's dialog open and says why when the write fails", async () => {
      const { root } = await opened(sourceOf([swim]), undefined, {
        remove: async () => {
          throw new Error("disk");
        },
      });
      await pressButton(root, "Remove");
      await pressConfirm(root);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      expect(root.ownerDocument.body.textContent).toContain("Couldn't remove the record.");
      expect(root.ownerDocument.body.textContent).toContain("Remove swim-oct?");
    });

    it("closes Remove's dialog on Cancel without removing", async () => {
      const remove = vi.fn(async () => {});
      const { root } = await opened(sourceOf([swim]), undefined, { remove });
      await pressButton(root, "Remove");
      await pressButton(root, "Cancel");
      expect(remove).not.toHaveBeenCalled();
      expect(root.ownerDocument.body.textContent).not.toContain("Remove swim-oct?");
    });

    it("shows Removing… and sends one remove however often Remove is pressed", async () => {
      let finish: () => void = () => {};
      const remove = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
      const { root } = await opened(sourceOf([swim]), undefined, { remove });
      await pressButton(root, "Remove");
      await pressConfirm(root);
      await pressConfirm(root);
      expect(remove).toHaveBeenCalledTimes(1);
      const confirm = [...root.ownerDocument.querySelectorAll("button")]
        .filter((each) => each.textContent?.startsWith("Remove"))
        .at(-1);
      expect(confirm?.getAttribute("aria-busy")).toBe("true");
      await act(async () => finish());
    });
  });
});
