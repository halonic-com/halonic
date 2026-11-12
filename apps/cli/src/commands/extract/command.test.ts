import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { verifies } from "@halonicjs/testing-spec";
import { filesOf, loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { type CapturedIo, captureIo } from "../../test/capture-io.ts";
import { goldenText, runGolden } from "../../test/golden.ts";
import { checklistProblems } from "../../test/golden-checklist.ts";
import { extractCommand } from "./command.ts";

/**
 * A made-up local-only home workspace: `family` uses a shared skill;
 * `investing` and its bank, a server on this computer, are left behind.
 */
const homeFiles: Record<string, string> = {
  "workspace.yaml": "# Made up for this test.\nid: home\nname: Home\nprivacy:\n  localOnly: true\n",
  "models.yaml": "aliases:\n  default:\n    provider: mock\n    model: echo\n",
  "providers/mock.yaml": "id: mock\nname: Mock\ntype: mock\nlocal: true\n",
  "library/skills/tone/SKILL.md": "---\nname: Tone\ndescription: Kind and short.\n---\nBe kind.\n",
  "library/connectors/bank.connector.yaml":
    "name: Bank\ntransport:\n  http:\n    url: http://localhost:8700/mcp\n",
  "hubs/family/hub.yaml": "id: family\nname: Family affairs\n",
  "hubs/family/agents/helper.agent.yaml":
    "id: helper\nname: Helper\nmodel: default\ninstructions: Help out.\nskills: [tone]\n",
  "hubs/investing/hub.yaml": "id: investing\nname: Investing\n",
  "hubs/investing/agents/advisor.agent.yaml":
    "id: advisor\nname: Advisor\nmodel: default\ninstructions: Advise.\nconnectors: [bank]\n",
};

let folder: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "halonic-cli-extract-"));
  writeFiles(join(folder, "home"), homeFiles);
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

function writeFiles(root: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
}

async function extract(...args: string[]): Promise<{ code: number; io: CapturedIo }> {
  const io = captureIo(folder);
  const code = await runCli(["extract", ...args], io, [extractCommand]);
  return { code, io };
}

verifies("cli.commands.extract.extract-hub", () => {
  describe("a hub in a new workspace", () => {
    it("lays out the hub and what it uses, and says what to do next", async () => {
      const { code, io } = await extract("family", "family", "--dir", "home");

      expect(code).toBe(exitCode.ok);
      expect(io.stdout).toEqual([
        `✓ Extracted the hub Family affairs to .${sep}family. The workspace home is unchanged.`,
        "  2 hub files · 1 shared file · 4 workspace files",
        "  Shared items: skills: tone",
        "",
        "Next:",
        "  cd family",
        "  halonic validate                    check the new workspace",
        "  halonic trust                       trust it on this computer before a run",
        "  Once it runs, remove hubs/family from home.",
      ]);
      expect(io.stderr).toEqual([]);
    });

    it("gives a workspace that loads on its own, with one hub and the original's settings", async () => {
      await extract("family", "family", "--dir", "home");

      const copy = await loadWorkspace(new FolderDefinitionStore(join(folder, "family")));
      expect(copy.issues.filter((issue) => issue.severity === "error")).toEqual([]);
      expect(filesOf(copy, "hub").map((file) => file.value.id)).toEqual(["family"]);
      expect(readFileSync(join(folder, "family", "workspace.yaml"), "utf8")).toBe(
        "# Made up for this test.\nid: family\nname: Family affairs\nprivacy:\n  localOnly: true\n",
      );
      expect(existsSync(join(folder, "family", "hubs", "investing"))).toBe(false);
      expect(readFileSync(join(folder, "home", "workspace.yaml"), "utf8")).toBe(
        homeFiles["workspace.yaml"],
      );
    });

    it("gives the hub, the folder, every file with its part and what it took with --json", async () => {
      const { code, io } = await extract("family", "family", "--dir", "home", "--json");

      expect(code).toBe(exitCode.ok);
      expect(JSON.parse(io.stdout.join("\n"))).toEqual({
        outputVersion: 1,
        ok: true,
        hub: "family",
        name: "Family affairs",
        folder: `.${sep}family`,
        dryRun: false,
        files: [
          { path: ".gitignore", part: "workspace" },
          { path: "hubs/family/agents/helper.agent.yaml", part: "hub" },
          { path: "hubs/family/hub.yaml", part: "hub" },
          { path: "library/skills/tone/SKILL.md", part: "shared" },
          { path: "models.yaml", part: "workspace" },
          { path: "providers/mock.yaml", part: "workspace" },
          { path: "workspace.yaml", part: "workspace" },
        ],
        uses: { connectors: [], skills: ["tone"], knowledge: [], collections: [] },
      });
    });

    it("lists the files by part and writes nothing with --dry-run", async () => {
      const { code, io } = await extract("family", "family", "--dir", "home", "--dry-run");

      expect(code).toBe(exitCode.ok);
      expect(io.stdout).toEqual([
        `Would extract the hub Family affairs to .${sep}family. Nothing was written.`,
        "",
        "From the hub:",
        "  hubs/family/agents/helper.agent.yaml",
        "  hubs/family/hub.yaml",
        "",
        "Shared items:",
        "  library/skills/tone/SKILL.md",
        "",
        "Workspace files:",
        "  .gitignore",
        "  models.yaml",
        "  providers/mock.yaml",
        "  workspace.yaml with the hub's id, name and description",
        "",
        "Run it again without --dry-run to write these files.",
      ]);
      expect(existsSync(join(folder, "family"))).toBe(false);
    });
  });

  describe("refusals", () => {
    it("names the hub it may have meant and the ones there are, and exits 4", async () => {
      const { code, io } = await extract("famly", "family", "--dir", "home");

      expect(code).toBe(exitCode.notFound);
      expect(io.stderr.slice(0, 2)).toEqual([
        '✕ There\'s no hub called "famly" in home. Did you mean family?',
        "  Hubs: family, investing",
      ]);
      expect(existsSync(join(folder, "family"))).toBe(false);
    });

    it("says a workspace with files at the root only has no hub to move out", async () => {
      writeFiles(join(folder, "solo"), { "workspace.yaml": "id: solo\nname: Solo\n" });

      const { code, io } = await extract("solo", "out", "--dir", "solo");

      expect(code).toBe(exitCode.notFound);
      expect(io.stderr.slice(0, 2)).toEqual([
        "✕ There's no hub in solo to extract.",
        "  Only a hub in its own folder under hubs/ can move out.",
      ]);
    });

    it("refuses a workspace with errors, and exits 5", async () => {
      const broken = "id: helper\nname: Helper\ninstructions: Help.\nskills: [missing]\n";
      writeFiles(join(folder, "home"), { "hubs/family/agents/helper.agent.yaml": broken });

      const { code, io } = await extract("family", "family", "--dir", "home");

      expect(code).toBe(exitCode.conflict);
      expect(io.stderr.slice(0, 2)).toEqual([
        `✕ Couldn't extract the hub family to .${sep}family: the workspace has 1 error, which the copy would keep.`,
        `  Run halonic validate --dir .${sep}home to see what to fix, then extract again.`,
      ]);
      expect(existsSync(join(folder, "family"))).toBe(false);
    });

    it("writes nothing into a folder with files in it, and exits 5", async () => {
      writeFiles(join(folder, "family"), { "notes.txt": "Mine.\n" });

      const { code, io } = await extract("family", "family", "--dir", "home");

      expect(code).toBe(exitCode.conflict);
      expect(io.stderr.slice(0, 2)).toEqual([
        `✕ Couldn't extract the hub family to .${sep}family: the folder isn't empty.`,
        "  Pick a new folder name.",
      ]);
      expect(readdirSync(join(folder, "family"))).toEqual(["notes.txt"]);
    });

    it("refuses a folder inside the workspace it comes from", async () => {
      const { code, io } = await extract("family", join("home", "family"), "--dir", "home");

      expect(code).toBe(exitCode.usage);
      expect(io.stderr).toEqual([
        `✕ The new workspace can't go inside .${sep}home, the one it comes from.`,
        "  Pick a folder outside it, such as one next to it.",
      ]);
      expect(existsSync(join(folder, "home", "family"))).toBe(false);
    });

    it("needs a hub and a folder", async () => {
      const { code, io } = await extract("family");

      expect(code).toBe(exitCode.usage);
      expect(io.stderr).toEqual([
        "✕ halonic extract takes a hub and a new folder.",
        "  Usage: halonic extract <hub> <new-folder> [--dir <folder>] [--dry-run]",
      ]);
    });
  });

  describe("golden output", () => {
    const golden = async (name: string, args: readonly string[]) => {
      // Each mode starts without the new folder.
      const run = await runGolden(
        args,
        () => {
          rmSync(join(folder, "family"), { recursive: true, force: true });
          return [extractCommand];
        },
        folder,
      );
      expect(checklistProblems(run)).toEqual([]);
      await expect(goldenText(args, run)).toMatchFileSnapshot(join("golden", `${name}.txt`));
    };

    it("for a hub in a new workspace", async () => {
      await golden("extracted", ["extract", "family", "family", "--dir", "home"]);
    });

    it("for a dry run", async () => {
      await golden("dry-run", ["extract", "family", "family", "--dir", "home", "--dry-run"]);
    });

    it("for a hub it doesn't have", async () => {
      await golden("unknown-hub", ["extract", "famly", "family", "--dir", "home"]);
    });
  });
});
