import { cp, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { heavyTestTimeout } from "../../test/golden.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { testCommandWith } from "../test/command.ts";
import { validateCommand } from "./command.ts";

// Row 11 of Nina's check on HAL-14257 (C337): a hub's `uses` that names
// shared items that don't exist passed `validate`, and every test passed.

const acmeExample = fileURLToPath(new URL("../../../../../examples/acme", import.meta.url));

let folder: string;
let acme: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-hub-uses-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
});

afterEach(async () => {
  await removeTestFolder(folder);
});

verifies("workspace.hub-uses", () => {
  it(
    "fails validate with exit 1 for a hub's uses that names a connector and a skill that don't exist, and test no longer passes",
    async () => {
      await writeFile(
        join(acme, "hubs/support/hub.yaml"),
        "name: Support\nuses: { connectors: [files], skills: [plain-words] }\n",
      );

      const validated = captureIo(acme);
      const validateCode = await runCli(["validate"], validated, [validateCommand]);

      expect(validateCode).toBe(exitCode.failed);
      const at = validated.stdout.indexOf(join("hubs", "support", "hub.yaml").split("/").join(sep));
      expect(validated.stdout.slice(at + 1, at + 3)).toEqual([
        expect.stringMatching(
          /^ {2}2:22 +✕ Hub "support" uses unknown connector "files" {2}\(unknown-connector\)$/,
        ),
        expect.stringMatching(
          /^ {2}2:\d+ +✕ Hub "support" uses unknown skill "plain-words" {2}\(unknown-skill\)$/,
        ),
      ]);

      const tested = captureIo(acme);
      const test = testCommandWith({ clock: fixedClock(Date.UTC(2026, 10, 20), 0) });
      const testCode = await runCli(["test"], tested, [test]);

      expect(testCode).toBe(exitCode.usage);
      expect(tested.stderr[0]).toBe(
        "✕ Couldn't test acme: Acme has 2 problems in its files. Nothing ran.",
      );
    },
    heavyTestTimeout,
  );
});
