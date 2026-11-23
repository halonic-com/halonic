import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { chatTools } from "../testing/call-tool.test-helper.ts";
import { testWorkspace } from "../testing/test-workspace.test-helper.ts";
import { listLimit } from "./read-tools.ts";

const hub = "hubs/sales/hub.yaml";
const sorter = "hubs/sales/agents/sorter.agent.yaml";
const tone = "skills/tone/SKILL.md";

verifies("assistant.build.authoring-tools", () => {
  it("reads a file as saved, not yet in a version", async () => {
    const call = chatTools(testWorkspace({ [hub]: "id: sales\nname: Sales EU\n" }));
    expect(await call("read_file", { path: hub })).toBe("id: sales\nname: Sales EU\n");
  });

  it("lists a new file that is a change to review", async () => {
    const workspace = testWorkspace({ [hub]: "id: sales\nname: Sales\n" });
    const call = chatTools(workspace);
    await call("propose_file", { path: tone, content: "# Tone\n", why: "A tone skill" });
    expect(await call("list_files", { under: "skills" })).toBe(tone);
    expect(await call("read_file", { path: tone })).toBe("# Tone\n");
  });

  it("says when a file doesn't exist", async () => {
    const call = chatTools(testWorkspace({}));
    expect(await call("read_file", { path: sorter })).toBe(`Error: ${sorter} does not exist`);
  });

  it("gives a kind's JSON Schema, and the kinds for one that doesn't exist", async () => {
    const call = chatTools(testWorkspace({}));
    expect(JSON.parse(await call("schema", { kind: "agent" }))["required"]).toEqual(["id", "name"]);
    expect(await call("schema", { kind: "robot" })).toMatch(
      /^Error: there is no kind "robot"\. The kinds are: .*agent.*\.$/u,
    );
  });

  it("lists at most a thousand paths and says how many more there are", async () => {
    const files = Object.fromEntries(
      Array.from({ length: listLimit + 2 }, (_, index) => [`notes/n${index}.md`, "x"]),
    );
    const lines = (await chatTools(testWorkspace(files))("list_files")).split("\n");
    expect(lines).toHaveLength(listLimit + 1);
    expect(lines.at(-1)).toBe('… and 2 more. Pass "under" to list one folder.');
  });

  it("says when a folder has nothing to list", async () => {
    expect(await chatTools(testWorkspace({}))("list_files", { under: "skills" })).toBe("No files.");
  });
});

verifies("assistant.build.read-limits", () => {
  const files = {
    [sorter]: "id: sorter\nname: Sorter\n",
    "package.json": "{}\n",
    ".git/config": "[core]\n",
    ".halonic/review/files/a.json": "{}\n",
    "shared/notes.md": "secret\n",
  };

  describe("read_file", () => {
    it("refuses a file in .git/", async () => {
      const call = chatTools(testWorkspace(files));
      expect(await call("read_file", { path: ".git/config" })).toBe(
        "Couldn't read .git/config: it can't be read.",
      );
    });

    it("refuses a file in .halonic/, however it is spelled", async () => {
      const call = chatTools(testWorkspace(files));
      for (const path of [".halonic/review/files/a.json", ".Halonic./review/files/a.json"]) {
        expect(await call("read_file", { path })).toBe(`Couldn't read ${path}: it can't be read.`);
      }
    });

    it("refuses a path outside the workspace", async () => {
      const call = chatTools(testWorkspace(files));
      for (const path of ["../outside.txt", "/etc/hosts", "hubs/../../x"]) {
        expect(await call("read_file", { path })).toBe(`Couldn't read ${path}: it can't be read.`);
      }
    });

    it("refuses a file through a symbolic link", async () => {
      const workspace = testWorkspace(files);
      workspace.store.links.add("shared");
      expect(await chatTools(workspace)("read_file", { path: "shared/notes.md" })).toBe(
        "Couldn't read shared/notes.md: it can't be read.",
      );
    });

    it("refuses anything but a Halonic item while untrusted", async () => {
      const call = chatTools(testWorkspace(files, false));
      expect(await call("read_file", { path: "package.json" })).toBe(
        "Not trusted yet: only Halonic items can be read.",
      );
      expect(await call("read_file", { path: sorter })).toBe(files[sorter]);
    });
  });

  describe("list_files", () => {
    it("leaves out .git/ and .halonic/, and refuses to list them", async () => {
      const call = chatTools(testWorkspace(files));
      expect((await call("list_files")).split("\n")).toEqual([
        sorter,
        "package.json",
        "shared/notes.md",
      ]);
      expect(await call("list_files", { under: ".git" })).toBe(
        "Couldn't read .git: it can't be read.",
      );
      expect(await call("list_files", { under: ".halonic/review" })).toBe(
        "Couldn't read .halonic/review: it can't be read.",
      );
    });

    it("refuses a folder outside the workspace", async () => {
      expect(await chatTools(testWorkspace(files))("list_files", { under: "../" })).toBe(
        "Couldn't read ../: it can't be read.",
      );
    });

    it("leaves out a symbolic link, and refuses to list through one", async () => {
      const workspace = testWorkspace(files);
      workspace.store.links.add("shared");
      const call = chatTools(workspace);
      expect(await call("list_files")).not.toContain("shared/");
      expect(await call("list_files", { under: "shared" })).toBe(
        "Couldn't read shared: it can't be read.",
      );
    });

    it("lists only Halonic items while untrusted", async () => {
      expect(await chatTools(testWorkspace(files, false))("list_files")).toBe(sorter);
    });
  });
});
