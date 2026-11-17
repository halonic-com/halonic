// @vitest-environment jsdom
import { settlePendingSaves } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanUp, opened, sourceOf, swim } from "../test-support/collection-page.tsx";

afterEach(cleanUp);

async function keepName(root: HTMLElement, text: string) {
  const input = root.querySelector<HTMLInputElement>('input[aria-label="collection name"]');
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    set?.call(input, text);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    input?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

verifies("library.collection-page", () => {
  describe("CollectionPage rename", () => {
    it("renames the collection once when a different name is kept", async () => {
      const rename = vi.fn(async () => {});
      const { root } = await opened(sourceOf([swim]), undefined, { rename });
      await keepName(root, "Claims 2024");
      expect(rename).toHaveBeenCalledTimes(1);
      expect(rename).toHaveBeenCalledWith({ hub: null, id: "claims" }, "Claims 2024");
    });

    it("registers the rename with the window close until it is written", async () => {
      let release: () => void = () => undefined;
      const rename = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
      const { root } = await opened(sourceOf([swim]), undefined, { rename });
      await keepName(root, "Claims 2024");
      let done = false;
      const waiting = settlePendingSaves().then(() => {
        done = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(done).toBe(false);

      release();
      await waiting;

      expect(done).toBe(true);
    });

    it("renames nothing when the name is left unchanged", async () => {
      const rename = vi.fn(async () => {});
      const { root } = await opened(sourceOf([swim]), undefined, { rename });
      await keepName(root, "Claims");
      expect(rename).not.toHaveBeenCalled();
    });

    it("says the collection couldn't be renamed when the write fails", async () => {
      const { root } = await opened(sourceOf([swim]), undefined, {
        rename: async () => {
          throw new Error("disk");
        },
      });
      await keepName(root, "Claims 2024");
      expect(root.querySelector('[role="alert"]')?.textContent).toBe(
        "Couldn't rename the collection.",
      );
    });
  });
});
