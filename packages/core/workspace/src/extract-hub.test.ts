import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { extractHub, filesOf, loadWorkspace } from "./index.ts";
import { home } from "./test/home-workspace.ts";
import { MemoryStore } from "./test/memory-store.ts";

verifies("workspace.extract", () => {
  describe("writing it", () => {
    it("lays out a workspace that loads on its own with no errors and one hub", async () => {
      const source = home();
      const target = new MemoryStore();

      const result = await extractHub(await loadWorkspace(source), source, target, "family");

      expect(result.ok).toBe(true);
      expect(target.written[0]).toBe(".gitignore");
      expect(target.written.at(-1)).toBe("workspace.yaml");
      const copy = await loadWorkspace(target);
      expect(copy.issues.filter((issue) => issue.severity === "error")).toEqual([]);
      expect(filesOf(copy, "hub").map((file) => file.value.id)).toEqual(["family"]);
      expect(target.files.get("library/skills/tone/examples.md")).toBe("Thanks, that helps.\n");
    });

    it("gives workspace.yaml the hub's id, name and description, and keeps the rest", async () => {
      const source = home();
      const target = new MemoryStore();

      await extractHub(await loadWorkspace(source), source, target, "family");

      expect(target.files.get("workspace.yaml")).toBe(
        [
          "# Our home, made up for this test.",
          "id: family",
          "name: Family affairs",
          "description: Chores and meals.",
          "privacy:",
          "  localOnly: true",
          "",
        ].join("\n"),
      );
      const settings = filesOf(await loadWorkspace(target), "workspace")[0]?.value;
      expect(settings?.privacy.localOnly).toBe(true);
    });

    it("drops the workspace's description when the hub has none", async () => {
      const source = home();
      const target = new MemoryStore();

      await extractHub(await loadWorkspace(source), source, target, "investing");

      expect(target.files.get("workspace.yaml")).not.toContain("description");
      expect(target.files.get("workspace.yaml")).toContain("name: Investing");
    });

    it("leaves the original workspace as it was", async () => {
      const source = home();
      const before = new Map(
        await Promise.all(
          (await source.list()).map(async (path) => [path, await source.read(path)] as const),
        ),
      );

      await extractHub(await loadWorkspace(source), source, new MemoryStore(), "family");

      for (const [path, text] of before) {
        expect(await source.read(path)).toBe(text);
      }
    });

    it("writes nothing into a target that has files, and says so", async () => {
      const source = home();
      const target = new MemoryStore({ "notes.txt": "Mine.\n" });

      const result = await extractHub(await loadWorkspace(source), source, target, "family");

      expect(result).toEqual({ ok: false, error: { kind: "not_empty", location: "memory:acme" } });
      expect(target.written).toEqual([]);
    });

    it("only says what it would write on a dry run", async () => {
      const source = home();
      const target = new MemoryStore();
      const workspace = await loadWorkspace(source);

      const dry = await extractHub(workspace, source, target, "family", { dryRun: true });
      expect(target.written).toEqual([]);

      const real = await extractHub(workspace, source, new MemoryStore(), "family");
      expect(dry.ok && dry.value.files).toEqual(real.ok && real.value.files);
    });

    it("refuses a dry run into a target that has files", async () => {
      const source = home();
      const target = new MemoryStore({ "notes.txt": "Mine.\n" });

      const result = await extractHub(await loadWorkspace(source), source, target, "family", {
        dryRun: true,
      });

      expect(result.ok || result.error.kind).toBe("not_empty");
    });
  });
});
