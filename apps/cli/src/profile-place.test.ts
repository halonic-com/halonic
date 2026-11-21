import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractCommand } from "./commands/extract/command.ts";
import { initCommand } from "./commands/init/command.ts";
import { exitCode } from "./exit-code.ts";
import { runCli } from "./run-cli.ts";
import { captureIo } from "./test/capture-io.ts";
import { smallWorkspace, validateIn, writeFiles } from "./test/validate-workspace.ts";

let folder: string;
/** The workspace folder. */
let acme: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "halonic-cli-profile-place-"));
  acme = join(folder, "acme");
  writeFiles(acme, smallWorkspace);
  // The home folder is the test's own folder, so the built-in profile is in it, not in acme.
  vi.stubEnv("HOME", folder);
  vi.stubEnv("USERPROFILE", folder);
  vi.stubEnv("HALONIC_HOME", "");
  vi.stubEnv("XDG_DATA_HOME", "");
  vi.stubEnv("LOCALAPPDATA", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(folder, { recursive: true, force: true });
});

verifies("cli.profile-outside-workspace", () => {
  describe("a profile a variable moved into the workspace", () => {
    it("is refused, with HALONIC_HOME named, and exits 2", async () => {
      vi.stubEnv("HALONIC_HOME", join(acme, ".profile"));

      const { code, io } = await validateIn(acme);

      expect(code).toBe(exitCode.usage);
      expect(io.stderr[0]).toContain("the profile folder HALONIC_HOME is inside this workspace.");
      expect(io.stderr[1]).toContain("set HALONIC_HOME to its new place");
    });

    it("is refused when HALONIC_HOME is the workspace itself", async () => {
      vi.stubEnv("HALONIC_HOME", acme);

      const { code, io } = await validateIn(acme, "--json");

      expect(code).toBe(exitCode.usage);
      expect(JSON.parse(io.stdout.join("\n")).error.code).toBe("profile-in-workspace");
    });

    it.skipIf(process.platform === "win32")("is refused through a link to it", async () => {
      const elsewhere = join(folder, "elsewhere");
      mkdirSync(elsewhere);
      symlinkSync(acme, join(elsewhere, "link"), "dir");
      vi.stubEnv("HALONIC_HOME", join(elsewhere, "link", "profile"));

      const { code } = await validateIn(acme);

      expect(code).toBe(exitCode.usage);
    });

    it.runIf(process.platform === "linux")(
      "names XDG_DATA_HOME when it moved the profile",
      async () => {
        vi.stubEnv("XDG_DATA_HOME", join(acme, ".data"));

        const { io } = await validateIn(acme);

        expect(io.stderr[0]).toContain(
          "the profile folder XDG_DATA_HOME is inside this workspace.",
        );
        expect(io.stderr[1]).toContain("set HALONIC_HOME to its new place");
        expect(io.stderr[1]).not.toContain("set XDG_DATA_HOME");
      },
    );

    it("leaves a sibling folder whose name starts the same alone", async () => {
      vi.stubEnv("HALONIC_HOME", join(folder, "acme-profile"));

      const { code } = await validateIn(acme);

      expect(code).toBe(exitCode.ok);
    });

    it("isn't made a workspace by init", async () => {
      vi.stubEnv("HALONIC_HOME", join(folder, "new", ".profile"));
      const io = captureIo(folder);

      const code = await runCli(["init", "new"], io, [initCommand]);

      expect(code).toBe(exitCode.usage);
      expect(io.stderr[0]).toContain("HALONIC_HOME is inside this workspace.");
    });

    it("isn't made a workspace by extract, which writes nothing there", async () => {
      vi.stubEnv("HALONIC_HOME", join(folder, "new", ".profile"));
      const io = captureIo(folder);

      const code = await runCli(["extract", "support", "new", "--dir", "acme"], io, [
        extractCommand,
      ]);

      expect(code).toBe(exitCode.usage);
      expect(io.stderr[0]).toContain("HALONIC_HOME is inside this workspace.");
      expect(existsSync(join(folder, "new"))).toBe(false);
    });
  });

  describe("the built-in profile", () => {
    it("in the home folder as the workspace still opens", async () => {
      writeFiles(folder, smallWorkspace);

      const { code } = await validateIn(folder);

      expect(code).toBe(exitCode.ok);
    });

    it("refuses a workspace inside it, and names it", async () => {
      vi.stubEnv("HALONIC_HOME", join(folder, "profile"));
      const inside = join(folder, "profile", "work");
      writeFiles(inside, smallWorkspace);

      const { code, io } = await validateIn(inside);

      expect(code).toBe(exitCode.usage);
      expect(io.stderr[0]).toContain("this workspace is inside the profile folder ~");
      expect(io.stderr[1]).toContain("Move the workspace somewhere else.");
    });
  });
});
