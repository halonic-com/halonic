import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { removeTestFolders, testFolders } from "./folders.test-helper.ts";
import { repoMapTool } from "./repo-map.ts";
import { ToolRefusal } from "./tool-input.ts";

afterEach(removeTestFolders);

async function mapFolders() {
  const folders = await testFolders();
  const tool = repoMapTool(folders);
  const map = (args: Record<string, unknown> = {}) => tool.run(args, new AbortController().signal);
  return { folders, map };
}

verifies("coding-tools.repo-map", () => {
  it("lists the packages with their names and source files, without tests", async () => {
    const { folders, map } = await mapFolders();
    await folders.write("package.json", JSON.stringify({ name: "acme" }));
    await folders.write("packages/a/package.json", JSON.stringify({ name: "@acme/a" }));
    await folders.write("packages/a/src/index.ts", "");
    await folders.write("packages/a/src/index.test.ts", "");
    await folders.write("packages/b/package.json", "not json");
    await folders.write("packages/b/src/b.ts", "");
    expect(await map()).toBe(
      ".  acme\npackages/a  @acme/a\n    src/index.ts\npackages/b\n    src/b.ts",
    );
  });

  it("gives 12 source files per package at most", async () => {
    const { folders, map } = await mapFolders();
    await folders.write("package.json", "{}");
    for (let file = 10; file < 30; file += 1) await folders.write(`src/f${file}.ts`, "");
    const answer = await map();
    expect(answer).toContain("src/f21.ts");
    expect(answer).not.toContain("src/f22.ts");
  });

  it("maps a folder without packages by its folders and files", async () => {
    const { folders, map } = await mapFolders();
    await folders.write("docs/guide.md", "");
    await folders.write("docs/deep/more.md", "");
    await folders.write("notes.txt", "");
    expect(await map()).toBe(
      "No package.json here. Folders and files:\ndocs/  (2 files)\nnotes.txt",
    );
    expect(await map({ path: "docs" })).toBe(
      "No package.json here. Folders and files:\ndocs/deep/  (1 files)\ndocs/guide.md",
    );
  });

  it("honours .gitignore, and says when there is nothing", async () => {
    const { folders, map } = await mapFolders();
    await folders.write(".gitignore", "build/\n");
    await folders.write("build/package.json", "{}");
    expect(await map()).toBe("No package.json here. Folders and files:\n.gitignore");
    await folders.write("empty/.gitignore", "*\n");
    expect(await map({ path: "empty" })).toBe("(no files)");
  });

  it("refuses a file and a path outside", async () => {
    const { folders, map } = await mapFolders();
    await folders.write("a.txt", "");
    await expect(map({ path: "a.txt" })).rejects.toThrow(ToolRefusal);
    await expect(map({ path: "../" })).rejects.toThrow(ToolRefusal);
    await expect(map({ dir: "." })).rejects.toThrow(ToolRefusal);
  });
});
