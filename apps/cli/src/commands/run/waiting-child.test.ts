import { mkdtempSync } from "node:fs";
import { cp, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProfileEnvironment } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { testRunSetup } from "../../test/run-setup.ts";
import { nodeProfileEnvironment } from "../../workspace-runs.ts";
import { runCommandWith } from "./command.ts";

// `halonic run` ends a run that waits because its child run waits for the
// person with the child's waiting lines, as `runs show` does (HAL-15951).

/** The Acme example, on the test model. */
const acmeExample = fileURLToPath(new URL("../../../../../examples/acme", import.meta.url));

let folder: string;
let acme: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-run-waiting-child-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
});

afterEach(async () => {
  await removeTestFolder(folder);
});

/** A profile folder of its own, so each test starts with no runs. */
function freshProfile(): ProfileEnvironment {
  const home = mkdtempSync(join(folder, "profile-"));
  return { ...nodeProfileEnvironment(), variables: { HALONIC_HOME: home } };
}

/** Triage: Acme's Support reply as its step Reply, which waits for the reply's approval. */
const triage = [
  "id: triage",
  "name: Triage",
  "initial: reply",
  "states:",
  "  reply:",
  "    description: Reply",
  "    type: workflow",
  "    workflow: support-reply",
  '    input: { mail: "{{input.mail}}" }',
  "    on:",
  "      - to: done",
  "  done:",
  "    type: final",
  "",
].join("\n");

verifies("cli.commands.runs.show-waiting-child", () => {
  it("ends a run waiting on its child run with the child's waiting line and how to answer it", async () => {
    await writeFile(join(acme, "hubs/support/workflows/triage.workflow.yaml"), triage);
    const io = captureIo(acme);

    const code = await runCli(["run", "triage", "--input", '{"mail":"Where is my order?"}'], io, [
      runCommandWith(testRunSetup(folder, freshProfile())),
    ]);

    expect(code).toBe(exitCode.ok);
    const waiting = io.stdout.findLastIndex((line) => line.startsWith("! Waiting for you"));
    expect(io.stdout.slice(waiting)).toEqual([
      "! Waiting for you: Approve this reply?",
      "",
      "  Sorry your order arrived damaged, Sam. We are looking into a refund and will write again today.",
      "",
      "  Acme support",
      "",
      "  Approving finishes the run. Nothing is sent.",
      "",
      expect.stringMatching(
        /^ {2}Answer with: halonic runs send \S{6}\.\S+ approve \(or reject\)$/,
      ),
    ]);
    expect(io.stdout).toContainEqual(expect.stringMatching(/^◌ Reply {3}Waiting for child run /));
  });
});
