import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { buildTree, type FileMarks, type TreeNode } from "./tree-model.ts";
import { foldersAbove, revealFile, visibleRows } from "./visible-rows.ts";

const acme = [
  "workspace.yaml",
  "models.yaml",
  "providers/local.yaml",
  "hubs/p/hub.yaml",
  "skills/tone.md",
  ".studio/runs/r1.jsonl",
  ".git/config",
  "node_modules/x/index.js",
];

function names(nodes: readonly TreeNode[]): string[] {
  return nodes.map((node) => node.name);
}

verifies("files.tree.folders-closed-no-local-data", () => {
  it("lists folders first, then files, each by name, and leaves out local data", () => {
    expect(names(buildTree(acme))).toEqual([
      "hubs",
      "providers",
      "skills",
      "models.yaml",
      "workspace.yaml",
    ]);
  });

  it("leaves local data out at any depth", () => {
    const tree = buildTree(["hubs/p/.git/HEAD", "hubs/p/hub.yaml"]);
    const hubs = tree[0];
    expect(hubs?.kind === "folder" ? names(hubs.children) : []).toEqual(["p"]);
    expect(visibleRows(tree, new Set(["hubs", "hubs/p"])).map((row) => row.node.path)).toEqual([
      "hubs",
      "hubs/p",
      "hubs/p/hub.yaml",
    ]);
  });

  it("shows folders closed until opened, and a file under two opened folders at depth 2", () => {
    const tree = buildTree(acme);
    expect(visibleRows(tree, new Set()).map((row) => row.node.path)).toEqual([
      "hubs",
      "providers",
      "skills",
      "models.yaml",
      "workspace.yaml",
    ]);
    const opened = visibleRows(tree, new Set(["hubs", "hubs/p"]));
    expect(opened.find((row) => row.node.name === "hub.yaml")?.depth).toBe(2);
  });

  it("shows a file the user creates, and drops one the user deletes, at once", () => {
    const created = buildTree([...acme, "hubs/p/agents/b.agent.yaml"]);
    const rows = visibleRows(created, new Set(["hubs", "hubs/p", "hubs/p/agents"]));
    expect(rows.map((row) => row.node.path)).toContain("hubs/p/agents/b.agent.yaml");
    const deleted = buildTree(acme.filter((path) => path !== "models.yaml"));
    expect(names(deleted)).not.toContain("models.yaml");
  });

  it("sorts without caring about case, and numbers the siblings for the ARIA tree", () => {
    const tree = buildTree(["b.yaml", "A.yaml", "a.yaml", "c/x.yaml"]);
    expect(names(tree)).toEqual(["c", "a.yaml", "A.yaml", "b.yaml"]);
    const rows = visibleRows(tree, new Set());
    expect(rows.map((row) => [row.position, row.siblings])).toEqual([
      [1, 4],
      [2, 4],
      [3, 4],
      [4, 4],
    ]);
  });

  it("ignores empty segments and a path with no name", () => {
    expect(names(buildTree(["", "/", "//x.yaml", "y//z.yaml"]))).toEqual(["y", "x.yaml"]);
  });
});

verifies("files.tree.marks-unsaved-and-problems", () => {
  const marks: FileMarks = new Map([
    ["hubs/p/agents/a.agent.yaml", { errors: 1 }],
    ["hubs/p/agents/c.agent.yaml", { warnings: 2, errors: 1 }],
    ["notes/x.md", { outside: true }],
  ]);
  const paths = [
    "hubs/p/agents/a.agent.yaml",
    "hubs/p/agents/c.agent.yaml",
    "hubs/p/hub.yaml",
    "notes/x.md",
  ];

  function find(nodes: readonly TreeNode[], path: string): TreeNode | undefined {
    for (const node of nodes) {
      if (node.path === path) return node;
      if (node.kind === "folder") {
        const inside = find(node.children, path);
        if (inside !== undefined) return inside;
      }
    }
    return undefined;
  }

  it("shows a file's errors and warnings on the file and adds them up on each folder above", () => {
    const tree = buildTree(paths, marks);
    expect(find(tree, "hubs/p/agents/a.agent.yaml")?.marks).toEqual({
      errors: 1,
      warnings: 0,
      outside: false,
    });
    expect(find(tree, "hubs")?.marks).toEqual({ errors: 2, warnings: 2, outside: false });
    expect(find(tree, "hubs/p")?.marks.errors).toBe(2);
  });

  it("marks a file that changed outside Halonic, and the folders above it", () => {
    const tree = buildTree(paths, marks);
    expect(find(tree, "notes/x.md")?.marks.outside).toBe(true);
    expect(find(tree, "notes")?.marks.outside).toBe(true);
    expect(find(tree, "hubs")?.marks.outside).toBe(false);
  });

  it("shows no mark once the problem is fixed or when nothing is marked", () => {
    const fixed = buildTree(paths, new Map());
    expect(find(fixed, "hubs")?.marks).toEqual({ errors: 0, warnings: 0, outside: false });
  });
});

verifies("files.tree.reveal-active-file", () => {
  it("names the folders above a file, outermost first", () => {
    expect(foldersAbove("hubs/p/agents/a.agent.yaml")).toEqual(["hubs", "hubs/p", "hubs/p/agents"]);
    expect(foldersAbove("models.yaml")).toEqual([]);
  });

  it("opens those folders and keeps the ones already open", () => {
    const opened = revealFile(new Set(["skills"]), "hubs/p/agents/a.agent.yaml");
    expect([...opened].sort()).toEqual(["hubs", "hubs/p", "hubs/p/agents", "skills"]);
  });

  it("shows the file's row once its folders are open", () => {
    const tree = buildTree(["hubs/p/agents/a.agent.yaml", "models.yaml"]);
    const rows = visibleRows(tree, revealFile(new Set(), "hubs/p/agents/a.agent.yaml"));
    expect(rows.map((row) => row.node.path)).toContain("hubs/p/agents/a.agent.yaml");
  });
});
