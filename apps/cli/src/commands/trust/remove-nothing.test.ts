import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
  folder = mkdtempSync(join(tmpdir(), "halonic-cli-trust-remove-"));
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

/** Runs `halonic` with `args` from the test folder, through pipes. */
async function halonic(...args: string[]) {
  const io = captureIo(folder);
  const code = await runCli(args, io, commands());
  return { code, stdout: io.stdout };
}

verifies("cli.commands.trust.remove-nothing", () => {
  it("says there was no trust to remove, for a workspace never trusted and a second --remove (C548 5)", async () => {
    const never = await halonic("trust", "--dir", "acme", "--remove");

    const fingerprint = (await halonic("trust", "--dir", "acme")).stdout.at(-1) ?? "";
    await halonic("trust", "--dir", "acme", "--yes", "--fingerprint", fingerprint);
    const first = await halonic("trust", "--dir", "acme", "--remove");
    const again = await halonic("trust", "--dir", "acme", "--remove", "--json");

    expect(never.code).toBe(exitCode.ok);
    expect(never.stdout).toEqual([
      "✓ Acme isn't trusted on this computer, so there was no trust to remove.",
    ]);
    expect(first.stdout[0]).toContain("Removed trust for Acme.");
    expect(again.code).toBe(exitCode.ok);
    expect(JSON.parse(again.stdout.join("\n"))).toMatchObject({
      name: "Acme",
      status: "not-trusted",
    });
  });
});
