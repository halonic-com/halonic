import type { KindValues } from "@halonicjs/format";
import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type LoadedFileOf, loadWorkspace } from "./index.ts";
import { leaveOutFor } from "./left-out-folders.ts";
import { LeftOutSource } from "./test/left-out-source.ts";

/** A Claude Code agent, writing in `folder` or in its default folder. */
function coder(folder?: string): string {
  const lines = ["name: Coder", "model: ollama/llama3.2", "harness: claude-code"];
  return [...lines, ...(folder === undefined ? [] : [`workingFolder: ${folder}`]), ""].join("\n");
}

/** A made-up workspace whose coder writes in `repo/`, which has installed packages. */
function acme(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "workspace.yaml": "id: acme\nname: Acme\n",
    "agents/coder.agent.yaml": coder("repo"),
    "README.md": "About Acme.\n",
    "repository.md": "Not in repo/.\n",
    "repo/src/main.ts": "export const answer = 42;\n",
    "repo/node_modules/left-pad/index.js": "module.exports = 1;\n",
    "tools/node_modules/kit/index.js": "module.exports = 2;\n",
    ...extra,
  };
}

/** An agent file as the loader gives it, for the checks the format makes first. */
function agentIn(folder: string): LoadedFileOf<"agent"> {
  const value = { id: "coder", harness: "claude-code", workingFolder: folder };
  return {
    path: "agents/coder.agent.yaml",
    kind: "agent",
    hub: null,
    value: value as unknown as KindValues["agent"],
  };
}

verifies("workspace.load-leaves-out-working-folders", () => {
  describe("loading a workspace whose harness agent writes in repo/", () => {
    it("keeps its version when a file in the working folder changes", async () => {
      const before = await loadWorkspace(new LeftOutSource(acme()));
      const after = await loadWorkspace(
        new LeftOutSource(acme({ "repo/src/main.ts": "export const answer = 43;\n" })),
      );

      expect(after.version).toBe(before.version);
    });

    it("changes its version when a file outside it changes", async () => {
      const before = await loadWorkspace(new LeftOutSource(acme()));
      const after = await loadWorkspace(new LeftOutSource(acme({ "README.md": "New.\n" })));

      expect(after.version).not.toBe(before.version);
    });

    it("neither lists nor reads anything in it or in a node_modules folder", async () => {
      const source = new LeftOutSource(acme());

      await loadWorkspace(source);

      const touched = [...source.listed, ...source.reads];
      expect(touched.filter((path) => path.startsWith("repo/"))).toEqual([]);
      expect(touched.filter((path) => path.includes("node_modules/"))).toEqual([]);
      expect(source.reads).toContain("agents/coder.agent.yaml");
    });

    it("names the folder as left out, and ignores only the files outside it", async () => {
      const workspace = await loadWorkspace(new LeftOutSource(acme()));

      expect(workspace.leftOut).toEqual(["repo"]);
      expect(workspace.ignored).toEqual(["README.md", "repository.md"]);
    });
  });

  it("leaves out a hub agent's default folder", async () => {
    const workspace = await loadWorkspace(
      new LeftOutSource({
        "workspace.yaml": "id: acme\nname: Acme\n",
        "hubs/support/hub.yaml": "id: support\nname: Support\n",
        "hubs/support/agents/coder.agent.yaml": coder(),
        "files/agents/coder/notes.md": "Draft.\n",
        "files/shared.md": "Shared.\n",
      }),
    );

    expect(workspace.leftOut).toEqual(["files/agents/coder"]);
    expect(workspace.ignored).toEqual(["files/shared.md"]);
  });

  it("leaves nothing out for an agent file that doesn't parse, so it reads more, not less", async () => {
    const broken = `${coder("repo")}output:\n  type: xml\n`;

    const workspace = await loadWorkspace(
      new LeftOutSource(acme({ "agents/coder.agent.yaml": broken })),
    );

    expect(workspace.leftOut).toEqual([]);
    expect(workspace.ignored).toContain("repo/src/main.ts");
    expect(workspace.ignored.some((path) => path.includes("node_modules/"))).toBe(false);
  });

  it("leaves nothing out for an agent in Halonic's own loop", async () => {
    const workspace = await loadWorkspace(
      new LeftOutSource(
        acme({ "agents/coder.agent.yaml": "name: Coder\nmodel: ollama/llama3.2\n" }),
      ),
    );

    expect(workspace.leftOut).toEqual([]);
    expect(workspace.ignored).toContain("repo/src/main.ts");
  });

  describe("a working folder that is, holds or sits inside a place for definitions", () => {
    for (const folder of ["agents", "agents/scratch", "Workflows", "hubs/support", "models.yaml"]) {
      it(`refuses ${folder}`, () => {
        expect(() => leaveOutFor([agentIn(folder)])).toThrow(
          new KindedError(
            "invalid_input",
            `the working folder ${folder} overlaps the workspace's definitions.`,
            {
              fix: "Give the agent a working folder outside the definition folders, such as files/.",
            },
          ),
        );
      });
    }

    it("leaves out a folder beside them", () => {
      expect(leaveOutFor([agentIn("files/scratch")])).toEqual({
        folders: ["files/scratch"],
        names: ["node_modules"],
      });
    });
  });
});

verifies("workspace.unreadable-file", () => {
  it("doesn't fail the load for an unreadable file in a working folder: it isn't read", async () => {
    const source = new LeftOutSource(acme());
    const read = source.read.bind(source);
    source.read = async (path) => {
      if (path.startsWith("repo/")) {
        throw Object.assign(new Error("permission denied"), { code: "EACCES" });
      }
      return await read(path);
    };

    const workspace = await loadWorkspace(source);

    expect(workspace.leftOut).toEqual(["repo"]);
  });
});
