import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { type CapturedIo, captureIo } from "../../test/capture-io.ts";
import { goldenText, runGolden } from "../../test/golden.ts";
import { checklistProblems } from "../../test/golden-checklist.ts";
import { validateCommand } from "./command.ts";

let folder: string;
/** The workspace folder, named `acme` so the summary names it the same on every computer. */
let acme: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "halonic-cli-validate-"));
  acme = join(folder, "acme");
  writeFiles(acme, {
    "workspace.yaml": "id: acme\nname: Acme\n",
    "models.yaml": "aliases:\n  fast:\n    provider: mock\n    model: echo\n",
    "providers/mock.yaml": "type: mock\n",
  });
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

function writeFiles(root: string, files: Readonly<Record<string, string>>): void {
  for (const [path, text] of Object.entries(files)) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
}

/** An agent in the support hub that names the model alias `model`. */
function agent(id: string, model: string): Readonly<Record<string, string>> {
  return {
    "hubs/support/hub.yaml": "id: support\nname: Support\n",
    [`hubs/support/agents/${id}.agent.yaml`]: `id: ${id}\nname: ${id}\nmodel: ${model}\ninstructions: Sort the mail.\n`,
  };
}

/** A connector that asks approval for a tool it doesn't allow: a warning, not an error. */
const warnedConnector = {
  "library/connectors/files.connector.yaml": [
    "name: Files",
    "transport:",
    "  stdio:",
    "    command: acme-files-server",
    "tools:",
    "  allow: [read_file]",
    "  approve: [write_file]",
    "",
  ].join("\n"),
};

async function validateIn(
  cwd: string,
  ...args: string[]
): Promise<{ code: number; io: CapturedIo }> {
  const io = captureIo(cwd);
  const code = await runCli(["validate", ...args], io, [validateCommand]);
  return { code, io };
}

verifies("cli.commands.validate.check-workspace", () => {
  describe("the report", () => {
    it("says a workspace with no problems has none, and exits 0", async () => {
      const { code, io } = await validateIn(acme);

      expect(code).toBe(exitCode.ok);
      expect(io.stdout).toEqual(["✓ Checked 3 files in acme. No problems."]);
      expect(io.stderr).toEqual([]);
    });

    it("lists warnings and passes, unless --strict makes them fail", async () => {
      writeFiles(acme, warnedConnector);

      const loose = await validateIn(acme);
      expect(loose.code).toBe(exitCode.ok);
      expect(loose.io.stdout.at(-1)).toBe("✓ Checked 4 files in acme. 1 warning.");
      expect(loose.io.stdout[0]).toBe(`library${sep}connectors${sep}files.connector.yaml`);
      expect(loose.io.stdout[1]).toMatch(
        /^ {2}\d+:\d+ +! Connector "files": "write_file" needs approval/,
      );
      expect(loose.io.stdout[1]).toMatch(/ {2}\(approved-tool-not-allowed\)$/);

      const strict = await validateIn(acme, "--strict");
      expect(strict.code).toBe(exitCode.failed);
      expect(strict.io.stdout.at(-1)).toBe("✕ 1 warning in 1 file. Checked 4 files.");
    });

    it("shows at most 20 problems, errors first, and says how to see them all", async () => {
      for (let index = 1; index <= 25; index += 1) {
        writeFiles(acme, agent(`agent-${String(index).padStart(2, "0")}`, "missing"));
      }

      const capped = await validateIn(folder, "--dir", "acme");
      const problemLines = (lines: readonly string[]) =>
        lines.filter((line) => line.startsWith("  ")).length;
      expect(capped.code).toBe(exitCode.failed);
      expect(problemLines(capped.io.stdout)).toBe(20);
      expect(capped.io.stdout.at(-2)).toBe(
        `Showing the first 20 of 25 problems. Run halonic validate --dir .${sep}acme --all to see them all.`,
      );

      const all = await validateIn(folder, "--dir", "acme", "--all");
      expect(problemLines(all.io.stdout)).toBe(25);
      expect(all.io.stdout.at(-1)).toBe("✕ 25 errors in 25 files. Checked 29 files.");
    });

    it("shows a control character from a file as its code, never as itself", async () => {
      writeFiles(acme, agent("sorter", '"\\e[31mred"'));

      const { io } = await validateIn(acme);

      expect(io.stdout.join("\n")).not.toContain("\u001b");
      expect(io.stdout.join("\n")).toContain("\\u001b[31mred");
    });
  });

  describe("--json", () => {
    it("gives the counts and every problem, errors first, never capped", async () => {
      writeFiles(acme, warnedConnector);
      for (let index = 1; index <= 21; index += 1) {
        writeFiles(acme, agent(`agent-${String(index).padStart(2, "0")}`, "missing"));
      }

      const { code, io } = await validateIn(acme, "--json");

      expect(code).toBe(exitCode.failed);
      const document = JSON.parse(io.stdout.join("\n"));
      expect(document).toMatchObject({
        outputVersion: 1,
        ok: false,
        files: 26,
        errors: 21,
        warnings: 1,
      });
      expect(document.problems).toHaveLength(22);
      expect(document.problems[0]).toEqual({
        file: "hubs/support/agents/agent-01.agent.yaml",
        line: expect.any(Number),
        col: expect.any(Number),
        severity: "error",
        code: expect.any(String),
        message: expect.any(String),
      });
      expect(document.problems.at(-1)).toMatchObject({
        file: "library/connectors/files.connector.yaml",
        severity: "warning",
        code: "approved-tool-not-allowed",
      });
      expect(io.stderr).toEqual([]);
    });
  });

  describe("errors", () => {
    it("stops with the no-workspace error and exit 4 in a folder without workspace.yaml", async () => {
      mkdirSync(join(folder, "downloads"));

      const { code, io } = await validateIn(folder, "--dir", "downloads");

      expect(code).toBe(exitCode.notFound);
      expect(io.stdout).toEqual([]);
      expect(io.stderr.slice(0, 2)).toEqual([
        `✕ Couldn't check .${sep}downloads: there's no workspace.yaml here.`,
        "  Run it inside a workspace, or create one with halonic init.",
      ]);
    });

    it("names the current folder when there's no --dir", async () => {
      const downloads = join(folder, "downloads");
      mkdirSync(downloads);

      const { io } = await validateIn(downloads);

      expect(io.stderr[0]).toBe("✕ Couldn't check downloads: there's no workspace.yaml here.");
    });
  });

  describe("golden output", () => {
    const golden = async (name: string, args: readonly string[]) => {
      const run = await runGolden(args, () => [validateCommand], acme);
      expect(checklistProblems(run, { reportOnStdout: true })).toEqual([]);
      await expect(goldenText(args, run)).toMatchFileSnapshot(join("golden", `${name}.txt`));
    };

    it("for a workspace with no problems", async () => {
      await golden("no-problems", ["validate"]);
    });

    it("for errors and a warning in two files", async () => {
      writeFiles(acme, { ...warnedConnector, ...agent("sorter", "smrt") });
      await golden("problems", ["validate"]);
    });

    it("for a folder without workspace.yaml", async () => {
      rmSync(join(acme, "workspace.yaml"));
      await golden("no-workspace", ["validate"]);
    });
  });
});

verifies("workspace.unreadable-file", () => {
  // Windows has no read permission bits, and root reads any file.
  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "names a workspace file that can't be read, with exit 2",
    async () => {
      writeFiles(acme, agent("sorter", "fast"));
      chmodSync(join(acme, "hubs/support/agents/sorter.agent.yaml"), 0o000);

      const { code, io } = await validateIn(acme);

      expect(code).toBe(exitCode.usage);
      expect(io.stdout).toEqual([]);
      expect(io.stderr.slice(0, 2)).toEqual([
        "✕ Couldn't check acme: the workspace file hubs/support/agents/sorter.agent.yaml can't be read.",
        "  Check the file's permissions, or move it out of the workspace.",
      ]);
    },
  );
});
