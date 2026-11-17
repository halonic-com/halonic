import type { ItemUsage } from "@halonicjs/app";
import { createToastStore } from "@halonicjs/studio-kit";
import { SaveState } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import type { SkillHost, SkillRef, SkillSource } from "./skill-host.ts";
import { SkillModel } from "./skill-model.ts";

const skillText = "---\nname: Refunds\ndescription: Use for refunds\nlicense: MIT\n---\nBe kind.\n";
const noUsage: ItemUsage = { agents: [], hubs: [], routines: [], collections: [] };

function hostOf(
  source: SkillSource | undefined,
  write = vi.fn(async (_skill: SkillRef, _text: string) => {}),
) {
  const state = { source };
  const host: SkillHost = {
    read: async () => state.source,
    write: async (skill, text) => {
      await write(skill, text);
      if (state.source !== undefined) state.source = { ...state.source, text };
    },
    usage: async () => noUsage,
    subscribe: () => () => {},
  };
  return { host, write };
}

async function opened(source: SkillSource | undefined) {
  const { host, write } = hostOf(source);
  const model = new SkillModel(host, { hub: null, id: "refunds" });
  await model.refresh();
  return { model, write };
}

verifies("library.skill-page", () => {
  describe("SkillModel", () => {
    it("reads the parts of the skill", async () => {
      const { model } = await opened({ text: skillText, files: [] });
      expect(model.state.parts).toMatchObject({
        name: "Refunds",
        description: "Use for refunds",
        instructions: "Be kind.",
        otherHeader: [{ key: "license", value: "MIT" }],
      });
    });

    it("saves a changed field once, keeping the rest of the header", async () => {
      const { model, write } = await opened({ text: skillText, files: [] });
      expect(await model.leave({ name: "Acme refunds" })).toBe(true);
      expect(write).toHaveBeenCalledOnce();
      expect(write).toHaveBeenCalledWith(
        { hub: null, id: "refunds" },
        "---\nname: Acme refunds\ndescription: Use for refunds\nlicense: MIT\n---\nBe kind.\n",
      );
      expect(model.state.parts?.name).toBe("Acme refunds");
    });

    it("writes nothing for a field left unchanged", async () => {
      const { model, write } = await opened({ text: skillText, files: [] });
      expect(await model.leave({ instructions: "Be kind." })).toBe(true);
      expect(write).not.toHaveBeenCalled();
    });

    it("keeps the old name with its hint when the name is emptied, until the next edit", async () => {
      const { model, write } = await opened({ text: skillText, files: [] });
      expect(await model.leave({ name: "  " })).toBe(true);
      expect(write).not.toHaveBeenCalled();
      expect(model.state.parts?.name).toBe("Refunds");
      expect(model.state.kept).toEqual(["name"]);
      model.edited("name");
      expect(model.state.kept).toEqual([]);
    });

    it("keeps the old description the same way", async () => {
      const { model, write } = await opened({ text: skillText, files: [] });
      await model.leave({ description: "" });
      expect(write).not.toHaveBeenCalled();
      expect(model.state.kept).toEqual(["description"]);
    });

    it("keeps the draft when the write fails", async () => {
      const failing = vi.fn(async (_skill: SkillRef, _text: string) => {
        throw new Error("disk full");
      });
      const { host } = hostOf({ text: skillText, files: [] }, failing);
      const model = new SkillModel(host, { hub: null, id: "refunds" });
      await model.refresh();
      expect(await model.leave({ name: "New" })).toBe(false);
      expect(model.state.parts?.name).toBe("Refunds");
    });

    it("says the skill is gone when the host has none", async () => {
      const { model } = await opened(undefined);
      expect(model.state).toMatchObject({ loaded: true, gone: true });
    });

    it("marks a file without a header as unreadable", async () => {
      const { model } = await opened({ text: "no header", files: [] });
      expect(model.state).toMatchObject({ loaded: true, unreadable: true });
    });

    it("keeps a save when the refresh after it fails, so the next save builds on it", async () => {
      let text = skillText;
      let reads = 0;
      const host: SkillHost = {
        read: async () => {
          if (++reads > 1) throw new Error("offline");
          return { text, files: [] };
        },
        write: async (_skill, next) => {
          text = next;
        },
        usage: async () => noUsage,
        subscribe: () => () => {},
      };
      const model = new SkillModel(host, { hub: null, id: "refunds" });
      await model.refresh();
      await model.leave({ name: "Acme refunds" });
      await model.leave({ description: "Use for Acme refunds" });
      expect(text).toContain("name: Acme refunds");
      expect(text).toContain("description: Use for Acme refunds");
      expect(model.state.parts?.name).toBe("Acme refunds");
    });

    it("says the first read failed while nothing has loaded, then clears it on the next read", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      let failing = true;
      const host: SkillHost = {
        read: async () => {
          if (failing) throw new Error("locked");
          return { text: skillText, files: [] };
        },
        write: async () => {},
        usage: async () => noUsage,
        subscribe: () => () => {},
      };
      const model = new SkillModel(host, { hub: null, id: "refunds" });
      await model.refresh();
      expect(model.state).toMatchObject({ loaded: false, failed: true });
      expect(error).toHaveBeenCalledOnce();
      failing = false;
      await model.refresh();
      expect(model.state).toMatchObject({ loaded: true, failed: false });
      error.mockRestore();
    });

    it("keeps a failed Name save through a save of Instructions, with the real save state", async () => {
      const writes: string[] = [];
      let failing = true;
      const { host } = hostOf(
        { text: skillText, files: [] },
        vi.fn(async (_skill: SkillRef, written: string) => {
          if (failing) throw new Error("disk full");
          writes.push(written);
        }),
      );
      const saving = new SaveState(createToastStore());
      const item = "skill/acme/refunds";
      const model = new SkillModel(host, { hub: null, id: "refunds" }, (title, write) =>
        saving.save({ key: item, title }, write),
      );
      await model.refresh();
      expect(await model.leave({ name: "Returns" })).toBe(false);
      expect(saving.note).toMatchObject({ kind: "failed" });
      failing = false;
      expect(await model.leave({ instructions: "Be brief." })).toBe(true);
      expect(writes).toHaveLength(1);
      expect(writes[0]).toContain("name: Returns");
      expect(writes[0]).toContain("Be brief.");
      expect(saving.note).toEqual({ kind: "saved" });
    });

    it("writes the whole text when the window's Try again runs a failed save", async () => {
      const writes: string[] = [];
      let failing = true;
      const { host } = hostOf(
        { text: skillText, files: [] },
        vi.fn(async (_skill: SkillRef, written: string) => {
          if (failing) throw new Error("disk full");
          writes.push(written);
        }),
      );
      const saving = new SaveState(createToastStore());
      const item = "skill/acme/refunds";
      const model = new SkillModel(host, { hub: null, id: "refunds" }, (title, write) =>
        saving.save({ key: item, title }, write),
      );
      await model.refresh();
      await model.leave({ name: "Returns" });
      await model.leave({ instructions: "Be brief." });
      failing = false;
      saving.tryAgain();
      await vi.waitFor(() => expect(writes).toHaveLength(1));
      expect(writes[0]).toContain("name: Returns");
      expect(writes[0]).toContain("Be brief.");
    });
  });
});
