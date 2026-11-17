// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NewSkillHost } from "../new-skill-host.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { NewSkillDialog } from "./new-skill-dialog.tsx";

fakeModal();
afterEach(() => {
  unmountAll();
  restoreModal();
  fakeModal();
});

function setup(hubIds: readonly string[] = ["acme"], create?: NewSkillHost["create"]) {
  const made = vi.fn(async () => ({ hub: "acme", id: "refunds" }));
  const host: NewSkillHost = {
    prepare: async () => {},
    hubs: () => hubIds.map((id) => ({ id, name: id })),
    folder: ({ name }) =>
      `hubs/acme/library/skills/${name.trim() === "" ? "" : `${name.trim().toLowerCase()}/`}`,
    create: create ?? made,
  };
  const onCreated = vi.fn();
  const root = render(<NewSkillDialog host={host} onCreated={onCreated} onCancel={() => {}} />);
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

verifies("library.new-skill", () => {
  describe("NewSkillDialog", () => {
    it("shows the skill's folder under Name, following the name", async () => {
      const { root } = setup();
      expect(page(root)).toContain("Folder: hubs/acme/library/skills/");
      await type(root, "Name", "Refunds");
      expect(page(root)).toContain("Folder: hubs/acme/library/skills/refunds/");
    });

    it("asks for the name and when to use it, and makes nothing", async () => {
      const { root, made } = setup();
      await press(root, "Create");
      expect(page(root)).toContain("Give it a name.");
      await type(root, "Name", "Refunds");
      await press(root, "Create");
      expect(page(root)).toContain("Say when an agent should use this skill.");
      expect(made).not.toHaveBeenCalled();
    });

    it("makes the skill and hands it on", async () => {
      const { root, made, onCreated } = setup();
      await type(root, "Name", "Refunds");
      await type(root, "When to use it", "Use for refunds");
      await press(root, "Create");
      expect(made).toHaveBeenCalledWith({
        name: "Refunds",
        description: "Use for refunds",
        hub: "acme",
      });
      expect(onCreated).toHaveBeenCalledWith({ hub: "acme", id: "refunds" });
    });

    it("shows the Hub field only with more than one hub", () => {
      expect(page(setup(["acme"]).root)).not.toContain("Hub");
      unmountAll();
      expect(page(setup(["acme", "beta"]).root)).toContain("Hub");
    });

    it("says why it couldn't create the skill and keeps what was typed", async () => {
      const { root, onCreated } = setup(["acme"], async () => {
        throw Object.assign(new Error("The disk is full."), { kind: "unavailable" });
      });
      await type(root, "Name", "Refunds");
      await type(root, "When to use it", "Use for refunds");
      await press(root, "Create");
      // The alert slot fills a frame after the request ends.
      await act(async () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
      expect(page(root)).toContain("Couldn't create the skill: The disk is full.");
      expect(onCreated).not.toHaveBeenCalled();
    });

    it("shows the generic sentence, not the system's text, for an error without a kind", async () => {
      const { root } = setup(["acme"], async () => {
        throw new Error("EACCES: permission denied, open '/x'");
      });
      await type(root, "Name", "Refunds");
      await type(root, "When to use it", "Use for refunds");
      await press(root, "Create");
      await act(async () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
      expect(page(root)).toContain(
        "Couldn't create the skill: Halonic ran into a problem it can't explain yet.",
      );
      expect(page(root)).not.toContain("EACCES");
    });
  });
});
