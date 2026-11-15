// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NewCollectionHost } from "../new-collection-host.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { NewCollectionDialog } from "./new-collection-dialog.tsx";

fakeModal();
afterEach(() => {
  unmountAll();
  restoreModal();
  fakeModal();
});

function setup(hubIds: readonly string[] = ["acme"], create?: NewCollectionHost["create"]) {
  const made = vi.fn(async () => ({ hub: "acme", id: "claims" }));
  const host: NewCollectionHost = {
    prepare: async () => {},
    hubs: () => hubIds.map((id) => ({ id, name: id })),
    file: ({ name }) =>
      `hubs/acme/library/collections/${name.trim() === "" ? "" : `${name.trim().toLowerCase()}.collection.yaml`}`,
    create: create ?? made,
  };
  const onCreated = vi.fn();
  const root = render(
    <NewCollectionDialog host={host} onCreated={onCreated} onCancel={() => {}} />,
  );
  return { root, host, made, onCreated };
}

async function type(root: HTMLElement, label: string, value: string) {
  const found = [...root.ownerDocument.querySelectorAll("label")].find((each) =>
    each.textContent?.startsWith(label),
  );
  const input = root.ownerDocument.getElementById(found?.htmlFor ?? "") as HTMLInputElement;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function press(root: HTMLElement, label: string) {
  const button = [...root.ownerDocument.querySelectorAll("button")].find((each) =>
    each.textContent?.startsWith(label),
  );
  await act(async () => {
    button?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const page = (root: HTMLElement) => root.ownerDocument.body.textContent ?? "";

verifies("library.new-collection", () => {
  describe("NewCollectionDialog", () => {
    it("shows the collection's file under Name, following the name", async () => {
      const { root } = setup();
      expect(page(root)).toContain("File: hubs/acme/library/collections/");
      await type(root, "Name", "Claims");
      expect(page(root)).toContain("File: hubs/acme/library/collections/claims.collection.yaml");
    });

    it("asks for the name and makes nothing", async () => {
      const { root, made } = setup();
      await press(root, "Create");
      expect(page(root)).toContain("Give it a name.");
      expect(made).not.toHaveBeenCalled();
    });

    it("makes the collection and hands it on", async () => {
      const { root, made, onCreated } = setup();
      await type(root, "Name", "Claims");
      await press(root, "Create");
      expect(made).toHaveBeenCalledWith({ name: "Claims", hub: "acme" });
      expect(onCreated).toHaveBeenCalledWith({ hub: "acme", id: "claims" });
    });

    it("shows the Hub field only with more than one hub", () => {
      expect(page(setup(["acme"]).root)).not.toContain("Hub");
      unmountAll();
      expect(page(setup(["acme", "beta"]).root)).toContain("Hub");
    });

    it("says why it couldn't create the collection and keeps what was typed", async () => {
      const { root, onCreated } = setup(["acme"], async () => {
        throw new Error("The disk is full.");
      });
      await type(root, "Name", "Claims");
      await press(root, "Create");
      // The alert slot fills a frame after the request ends.
      await act(async () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
      expect(page(root)).toContain("Couldn't create the collection: The disk is full.");
      expect(onCreated).not.toHaveBeenCalled();
    });
  });
});
