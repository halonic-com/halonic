// @vitest-environment jsdom
import type { ItemUsage } from "@halonicjs/app";
import { type ItemViewProps, limitedLookup } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { libraryFeature } from "../feature.ts";
import { requestSkillInstructionsFocus } from "../skill-focus-request.ts";
import { type SkillHost, SkillHostService, type SkillSource } from "../skill-host.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { SkillPage } from "./skill-page.tsx";

afterEach(unmountAll);

const text = "---\nname: Refunds\ndescription: Use for refunds\nlicense: MIT\n---\nBe kind.\n";
const nobody: ItemUsage = { agents: [], hubs: [], routines: [], collections: [] };

/** The window's save state as the page sees it: it runs the write, and a failed one waits for Try again. */
function savingStub() {
  const failed: Array<{ title: string; retry: () => Promise<boolean> }> = [];
  const save = vi.fn(
    async ({ title }: { key: string; title: string }, write: () => Promise<void>) => {
      try {
        await write();
        return true;
      } catch {
        failed.push({ title, retry: () => save({ key: "", title }, write) });
        return false;
      }
    },
  );
  return { save, failed };
}

function setup(
  source: SkillSource | undefined = { text, files: [] },
  usage: ItemUsage = nobody,
  missing = false,
) {
  const write = vi.fn(async () => {});
  const openItem = vi.fn();
  const openPlace = vi.fn();
  const saving = savingStub();
  let current = source;
  const listeners = new Set<() => void>();
  /** The file changes from outside the page, as an edit in Changes or the code editor does. */
  const external = (newText: string) => {
    current = { text: newText, files: [] };
    for (const listener of listeners) listener();
  };
  const host: SkillHost = {
    read: async () => (missing ? undefined : current),
    write,
    usage: async () => usage,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const props = {
    item: { kind: "skill", hub: "~workspace", id: "refunds" },
    context: {
      services: limitedLookup(libraryFeature, {
        get: (key: unknown) => (key === SkillHostService ? host : undefined),
        find: (key: unknown) => (key === SkillHostService ? host : undefined),
      }),
      announcer: { announceState: vi.fn() },
      openItem,
      openPlace,
      saving,
    },
    Sections: () => null,
  } as unknown as ItemViewProps;
  return { props, write, openItem, openPlace, saving, external };
}

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function field(root: HTMLElement, label: string): HTMLInputElement | HTMLTextAreaElement {
  const found = [...root.querySelectorAll("label")].find((each) =>
    each.textContent?.startsWith(label),
  );
  const control = found === undefined ? null : root.querySelector(`#${CSS.escape(found.htmlFor)}`);
  if (control === null) throw new Error(`No field ${label}`);
  return control as HTMLInputElement | HTMLTextAreaElement;
}

function type(control: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
  act(() => {
    Object.getOwnPropertyDescriptor(prototype.prototype, "value")?.set?.call(control, value);
    control.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function leave(control: HTMLElement): Promise<void> {
  await act(async () => {
    control.focus();
    control.blur();
  });
  await settled();
}

verifies("library.skill-page", () => {
  describe("SkillPage", () => {
    it("shows the parts, the other header fields and who uses the skill", async () => {
      const usage = { ...nobody, agents: [{ id: "support", name: "Support", hub: null }] };
      const { props, openItem } = setup(
        { text, files: [{ label: "reference.md", id: "r.md" }] },
        usage,
      );
      const root = render(<SkillPage {...props} />);
      await settled();
      expect(root.querySelector("h1")?.textContent).toBe("Refunds");
      expect(field(root, "Name").value).toBe("Refunds");
      expect(field(root, "When to use it").value).toBe("Use for refunds");
      expect(field(root, "Instructions").value).toBe("Be kind.");
      expect(root.textContent).toContain("Agents read this to decide when to use the skill.");
      expect(root.textContent).toContain("license: MIT");
      expect(root.textContent).toContain("Kept as they are. Edit them in the file.");
      const buttons = [...root.querySelectorAll("button")];
      act(() => buttons.find((each) => each.textContent === "Support")?.click());
      expect(openItem).toHaveBeenCalledWith({ kind: "agent", hub: "~workspace", id: "support" });
      act(() => buttons.find((each) => each.textContent === "reference.md")?.click());
      expect(openItem).toHaveBeenCalledWith({ kind: "file", hub: "~workspace", id: "r.md" });
    });

    it("leaves out the header and files rows when there is nothing to show, and says no agent uses it", async () => {
      const { props } = setup({
        text: "---\nname: Refunds\ndescription: Use\n---\nBe kind.\n",
        files: [],
      });
      const root = render(<SkillPage {...props} />);
      await settled();
      expect(root.textContent).not.toContain("Also in the header");
      expect(root.textContent).not.toContain("Files in this skill");
      expect(root.textContent).toContain(
        "No agent uses this skill yet. Add it under an agent's Tools.",
      );
    });

    it("puts the cursor in Instructions for a skill just made, and not for a later visit", async () => {
      requestSkillInstructionsFocus({ hub: null, id: "refunds" });
      const { props } = setup();
      const root = render(<SkillPage {...props} />);
      await settled();
      expect(document.activeElement).toBe(field(root, "Instructions"));
      unmountAll();
      const again = render(<SkillPage {...setup().props} />);
      await settled();
      expect(document.activeElement).not.toBe(field(again, "Instructions"));
    });

    it("saves a field when it is left", async () => {
      const { props, write } = setup();
      const root = render(<SkillPage {...props} />);
      await settled();
      const name = field(root, "Name");
      type(name, "Acme refunds");
      await leave(name);
      expect(write).toHaveBeenCalledOnce();
    });

    it("saves through the window's save state, and a failed save keeps the draft with no box on the page", async () => {
      const { props, write, saving } = setup();
      const failure = Object.assign(new Error("The disk is full."), { kind: "unavailable" });
      write.mockRejectedValueOnce(failure);
      const root = render(<SkillPage {...props} />);
      await settled();
      const instructions = field(root, "Instructions");
      type(instructions, "Be very kind.");
      await leave(instructions);
      expect(saving.save).toHaveBeenCalledWith(
        { key: "skill/~workspace/refunds", title: "Refunds" },
        expect.any(Function),
      );
      expect(root.textContent).not.toContain("Couldn't save");
      expect(field(root, "Instructions").value).toBe("Be very kind.");
      await act(async () => {
        await saving.failed[0]?.retry();
      });
      await settled();
      expect(write).toHaveBeenCalledTimes(2);
    });

    it("follows the file again after the window's Try again saved the draft", async () => {
      const { props, write, saving, external } = setup();
      write.mockRejectedValueOnce(new Error("The disk is full."));
      const root = render(<SkillPage {...props} />);
      await settled();
      const instructions = field(root, "Instructions");
      type(instructions, "Be very kind.");
      await leave(instructions);
      await act(async () => {
        await saving.failed[0]?.retry();
      });
      await settled();
      external(text.replace("Be kind.", "Be brief."));
      await settled();
      expect(field(root, "Instructions").value).toBe("Be brief.");
    });

    it("keeps the old name with its hint when the name is emptied, and drops the hint on the next edit", async () => {
      const { props, write } = setup();
      const root = render(<SkillPage {...props} />);
      await settled();
      const name = field(root, "Name");
      type(name, "");
      await leave(name);
      expect(write).not.toHaveBeenCalled();
      expect(field(root, "Name").value).toBe("Refunds");
      expect(root.textContent).toContain("A skill needs a name, so the old one is kept.");
      type(field(root, "Name"), "R");
      expect(root.textContent).not.toContain("A skill needs a name");
    });

    it("says the skill isn't in the workspace when the host has none", async () => {
      const { props, openPlace } = setup({ text: "", files: [] }, nobody, true);
      const root = render(<SkillPage {...props} />);
      await settled();
      expect(root.textContent).toContain("This skill isn't in this workspace any more.");
      act(() => root.querySelector("button")?.click());
      expect(openPlace).toHaveBeenCalledWith("library");
    });
  });
});
