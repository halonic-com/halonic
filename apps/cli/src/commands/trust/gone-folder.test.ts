import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { FileTrustStore } from "@halonicjs/adapter-fs-node";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { createTrustCommand } from "./command.ts";

let folder: string;
let store: FileTrustStore;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "halonic-cli-trust-gone-"));
  store = new FileTrustStore(join(folder, "profile", "trust"));
  const files: Record<string, string> = {
    "workspace.yaml": "id: acme\nname: Acme\n",
    "library/connectors/mail.connector.yaml":
      "name: Mail\ntransport:\n  stdio:\n    command: npx\n    args: ['@acme/mail-mcp']\ntools:\n  approve: []\n",
  };
  for (const [path, text] of Object.entries(files)) {
    const file = join(folder, "acme", path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
});

afterEach(async () => {
  await removeTestFolder(folder);
});

const commands = () => [
  createTrustCommand(() => ({
    store,
    clock: fixedClock(Date.UTC(2026, 10, 3, 12)),
    commandSearch: { path: undefined, endings: [] },
  })),
];

/** Runs `halonic` with `args` from `cwd`, through pipes. */
async function halonic(cwd: string, ...args: string[]) {
  const io = captureIo(cwd);
  const code = await runCli(args, io, commands());
  return { code, stdout: io.stdout };
}

verifies("cli.commands.trust.review-and-trust", () => {
  it("removes the trust of a gone folder named through a link to its parent", async () => {
    const fingerprint = (await halonic(folder, "trust", "--dir", "acme")).stdout.at(-1) ?? "";
    await halonic(folder, "trust", "--dir", "acme", "--yes", "--fingerprint", fingerprint);
    rmSync(join(folder, "acme"), { recursive: true });
    // A link stands in for a Windows short name such as `RUNNER~1`: the parent
    // is still there under another path, so the record's real path is found.
    const link = join(folder, "link");
    symlinkSync(folder, link, "junction");

    const removed = await halonic(link, "trust", "--dir", "acme", "--remove");

    expect(removed.code).toBe(exitCode.ok);
    expect(removed.stdout[0]).toContain(`Removed trust for .${sep}acme.`);
  });
});
