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
import { join, sep } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { verifies } from "@halonicjs/testing-spec";
import { filesOf, loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { type CapturedIo, captureIo } from "../../test/capture-io.ts";
import { goldenText, heavyTestTimeout, runGolden } from "../../test/golden.ts";
import { checklistProblems } from "../../test/golden-checklist.ts";
import { initCommand } from "./command.ts";
import { initExamples } from "./examples.ts";

let folder: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "halonic-cli-init-"));
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

async function initIn(cwd: string, ...args: string[]): Promise<{ code: number; io: CapturedIo }> {
  const io = captureIo(cwd);
  const code = await runCli(["init", ...args], io, [initCommand]);
  return { code, io };
}

verifies("cli.commands.init.create-workspace", () => {
  describe("a new workspace", () => {
    it("lays out the workspace in a new folder and says what to do next", async () => {
      const { code, io } = await initIn(folder, "acme");

      expect(code).toBe(exitCode.ok);
      expect(io.stdout).toEqual([
        `✓ Created the workspace acme in .${sep}acme.`,
        "",
        "Next:",
        "  cd acme",
        "  halonic validate                    check the files as you edit them",
        "  Or open the folder in Studio to add your first agent.",
      ]);
      expect(io.stderr).toEqual([]);
      expect(readFileSync(join(folder, "acme", "workspace.yaml"), "utf8")).toContain("id: acme");
    });

    it("uses the current folder when it's empty, with no cd", async () => {
      const acme = join(folder, "acme");
      mkdirSync(acme);

      const { code, io } = await initIn(acme);

      expect(code).toBe(exitCode.ok);
      expect(io.stdout[0]).toBe("✓ Created the workspace acme in this folder.");
      expect(io.stdout).not.toContain("  cd acme");
      expect(existsSync(join(acme, "workspace.yaml"))).toBe(true);
    });

    it("puts a folder name with a space in quotes after cd, so it can be copied", async () => {
      const { io } = await initIn(folder, "my agents");

      expect(io.stdout[3]).toBe('  cd "my agents"');
      expect(io.stdout[0]).toBe(`✓ Created the workspace my agents in .${sep}my agents.`);
    });

    it("gives the workspace, the files it wrote and the counts with --json", async () => {
      const { code, io } = await initIn(folder, "acme", "--json");

      expect(code).toBe(exitCode.ok);
      expect(JSON.parse(io.stdout.join("\n"))).toEqual({
        outputVersion: 1,
        ok: true,
        workspace: { name: "acme", folder: `.${sep}acme` },
        example: null,
        created: [".gitignore", "workspace.yaml"],
        counts: { hubs: 0, agents: 0, workflows: 0, routines: 0 },
      });
    });
  });

  describe("errors", () => {
    it("writes nothing into a folder with files in it, and exits 5", async () => {
      mkdirSync(join(folder, "acme"));
      writeFileSync(join(folder, "acme", "notes.txt"), "Mine.\n");

      const { code, io } = await initIn(folder, "acme");

      expect(code).toBe(exitCode.conflict);
      expect(io.stdout).toEqual([]);
      expect(io.stderr.slice(0, 2)).toEqual([
        `✕ Couldn't create the workspace in .${sep}acme: the folder isn't empty.`,
        "  Pick a new folder name, or run it in an empty folder.",
      ]);
      expect(readdirSync(join(folder, "acme"))).toEqual(["notes.txt"]);
    });

    it("says this folder, not ., when the current folder has files in it", async () => {
      writeFileSync(join(folder, "notes.txt"), "Mine.\n");

      const { code, io } = await initIn(folder);

      expect(code).toBe(exitCode.conflict);
      expect(io.stderr[0]).toBe(
        "✕ Couldn't create the workspace in this folder: the folder isn't empty.",
      );
      expect(readdirSync(folder)).toEqual(["notes.txt"]);
    });

    it("refuses more than one folder name", async () => {
      const { code, io } = await initIn(folder, "acme", "demo");

      expect(code).toBe(exitCode.usage);
      expect(io.stderr).toEqual([
        "✕ halonic init takes one folder name, and you gave two: acme, demo.",
        "  Usage: halonic init [folder] [--example acme]",
      ]);
    });
  });

  describe("golden output", () => {
    const golden = async (name: string, args: readonly string[]) => {
      // Each mode starts from the same empty folder.
      const run = await runGolden(
        args,
        () => {
          rmSync(join(folder, "acme"), { recursive: true, force: true });
          return [initCommand];
        },
        folder,
      );
      expect(checklistProblems(run)).toEqual([]);
      await expect(goldenText(args, run)).toMatchFileSnapshot(join("golden", `${name}.txt`));
    };

    it("for a new workspace", async () => {
      await golden("created", ["init", "acme"]);
    });

    it("for a folder that isn't empty", async () => {
      mkdirSync(join(folder, "acme"));
      writeFileSync(join(folder, "acme", "notes.txt"), "Mine.\n");
      const args = ["init", "acme"];
      const run = await runGolden(args, () => [initCommand], folder);
      expect(checklistProblems(run)).toEqual([]);
      await expect(goldenText(args, run)).toMatchFileSnapshot(join("golden", "not-empty.txt"));
    });
  });
});

verifies("cli.commands.init.copy-example", () => {
  const acme = initExamples["acme"];
  if (acme === undefined) {
    throw new Error("The CLI has no Acme example.");
  }

  describe("a copy of the Acme example", () => {
    it("copies every file into ./acme and says what to do next", async () => {
      const { code, io } = await initIn(folder, "--example", "acme");

      expect(code).toBe(exitCode.ok);
      expect(io.stdout).toEqual([
        `✓ Created a copy of the Acme example in .${sep}acme.`,
        "  2 hubs · 3 agents · 2 workflows · 1 routine · runs on the test model, no key needed",
        "",
        "Next:",
        "  cd acme",
        "  halonic test                        run its workflow tests (no key, nothing sent)",
        "  halonic run support-reply --input examples/refund-question.json",
        "  Or open the folder in Studio.",
      ]);
      expect(io.stderr).toEqual([]);
      const filesIn = (root: string) => new FolderDefinitionStore(root).list();
      expect(await filesIn(join(folder, "acme"))).toEqual(
        [".gitignore", ...(await filesIn(acme.folder))].sort(),
      );
      expect(readFileSync(join(folder, "acme", "examples", "refund-question.json"), "utf8")).toBe(
        readFileSync(join(acme.folder, "examples", "refund-question.json"), "utf8"),
      );
    });

    it("goes next to an ./acme that is already there, and says so", async () => {
      mkdirSync(join(folder, "acme"));
      writeFileSync(join(folder, "acme", "notes.txt"), "Mine.\n");

      const { code, io } = await initIn(folder, "--example", "acme");

      expect(code).toBe(exitCode.ok);
      expect(io.stdout[0]).toBe(
        `✓ Created a copy of the Acme example in .${sep}acme-2. .${sep}acme was already there.`,
      );
      expect(io.stdout).toContain("  cd acme-2");
      expect(readdirSync(join(folder, "acme"))).toEqual(["notes.txt"]);
      expect(existsSync(join(folder, "acme-2", "workspace.yaml"))).toBe(true);
    });

    it("uses the folder it is given, with no cd when it's the current one", async () => {
      const { code, io } = await initIn(folder, ".", "--example", "acme");

      expect(code).toBe(exitCode.ok);
      expect(io.stdout[0]).toBe("✓ Created a copy of the Acme example in ..");
      expect(io.stdout.some((line) => line.startsWith("  cd "))).toBe(false);
      expect(existsSync(join(folder, "workspace.yaml"))).toBe(true);
    });

    it("gives the example, the files it wrote and the counts with --json", async () => {
      const { code, io } = await initIn(folder, "--example", "acme", "--json");

      expect(code).toBe(exitCode.ok);
      const json = JSON.parse(io.stdout.join("\n"));
      expect(json).toMatchObject({
        outputVersion: 1,
        ok: true,
        workspace: { name: "Acme", folder: `.${sep}acme` },
        example: "acme",
        counts: { hubs: 2, agents: 3, workflows: 2, routines: 1 },
      });
      expect(json.created[0]).toBe(".gitignore");
      expect(json.created.at(-1)).toBe("workspace.yaml");
    });

    it("runs on the test model only, with no connector, so run needs no key and no trust", async () => {
      await initIn(folder, "--example", "acme");

      const copy = await loadWorkspace(new FolderDefinitionStore(join(folder, "acme")));
      expect(copy.issues).toEqual([]);
      expect(filesOf(copy, "provider").map((file) => file.value.type)).toEqual(["mock"]);
      for (const kind of ["connector", "knowledge", "integration", "plugin", "runtime"] as const) {
        expect(filesOf(copy, kind)).toEqual([]);
      }
      const workflows = filesOf(copy, "workflow").map((file) => file.value.id);
      expect(workflows).toContain(acme.workflow.id);
    });
  });

  describe("errors", () => {
    it("writes nothing into a named folder with files in it, and exits 5", async () => {
      mkdirSync(join(folder, "demo"));
      writeFileSync(join(folder, "demo", "notes.txt"), "Mine.\n");

      const { code, io } = await initIn(folder, "demo", "--example", "acme");

      expect(code).toBe(exitCode.conflict);
      expect(io.stderr[0]).toBe(
        `✕ Couldn't create the workspace in .${sep}demo: the folder isn't empty.`,
      );
      expect(readdirSync(join(folder, "demo"))).toEqual(["notes.txt"]);
    });

    it("names the example it may have meant and the ones there are, and exits 2", async () => {
      const { code, io } = await initIn(folder, "--example", "acem");

      expect(code).toBe(exitCode.usage);
      expect(io.stderr).toEqual([
        '✕ There\'s no example called "acem". Did you mean acme?',
        "  Examples: acme",
      ]);
      expect(readdirSync(folder)).toEqual([]);
    });

    it("guesses nothing for a name far from every example", async () => {
      const { io } = await initIn(folder, "--example", "billing");

      expect(io.stderr[0]).toBe('✕ There\'s no example called "billing".');
    });
  });

  // It copies the whole example once per mode: up to 3 s on Linux and 16 s on Windows in CI (HAL-5473).
  it("has golden output for a copy of the example", { timeout: heavyTestTimeout }, async () => {
    const args = ["init", "--example", "acme"];
    // Each mode starts from the same empty folder.
    const run = await runGolden(
      args,
      () => {
        rmSync(join(folder, "acme"), { recursive: true, force: true });
        return [initCommand];
      },
      folder,
    );
    expect(checklistProblems(run)).toEqual([]);
    await expect(goldenText(args, run)).toMatchFileSnapshot(join("golden", "example.txt"));
  });
});
