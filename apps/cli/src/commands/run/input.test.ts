import { mkdtempSync } from "node:fs";
import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProfileEnvironment } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { runCli } from "../../run-cli.ts";
import { type CapturedIo, captureIo } from "../../test/capture-io.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { testRunSetup } from "../../test/run-setup.ts";
import { nodeProfileEnvironment } from "../../workspace-runs.ts";
import { runCommandWith } from "./command.ts";

/** The Acme example, on the test model: Support reply's first step reads input.mail. */
const acmeExample = fileURLToPath(new URL("../../../../../examples/acme", import.meta.url));

let folder: string;
let acme: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-run-input-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
});

afterEach(async () => {
  await removeTestFolder(folder);
});

/** `halonic run` in Acme, with a profile folder of its own. */
async function run(...args: string[]): Promise<{ code: number; io: CapturedIo }> {
  const home = mkdtempSync(join(folder, "profile-"));
  const profile: ProfileEnvironment = {
    ...nodeProfileEnvironment(),
    variables: { HALONIC_HOME: home },
  };
  const io = captureIo(acme);
  const code = await runCli(["run", ...args], io, [runCommandWith(testRunSetup(folder, profile))]);
  return { code, io };
}

verifies("cli.run-input-fields", () => {
  // C337 row 2 (HAL-14267): every step showed ✓ while the agent got "(not set)" for the email.
  it("refuses an input without the field the first step reads, and starts nothing", async () => {
    const wrong = await run("support-reply", "--input", '{"email": "Hi, a refund please"}');
    const empty = await run("support-reply", "--input", "{}");
    const none = await run("support-reply");

    expect([wrong.code, empty.code, none.code]).toEqual([2, 2, 2]);
    expect([wrong.io.stderr[0], empty.io.stderr[0], none.io.stderr[0]]).toEqual([
      "✕ Couldn't run support-reply: the input has no field mail, which the step Read the email reads. Your input has: email.",
      "✕ Couldn't run support-reply: the input has no field mail, which the step Read the email reads. Your input has no fields.",
      "✕ Couldn't run support-reply: the input has no field mail, which the step Read the email reads. You gave no --input.",
    ]);
    expect(wrong.io.stderr[1]).toBe(
      "  Pass a JSON object with mail, in a file or as text, such as --input input.json.",
    );
    expect(wrong.io.stdout).toEqual([]);
  });
});
