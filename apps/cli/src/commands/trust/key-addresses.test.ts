import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FileTrustStore } from "@halonicjs/adapter-fs-node";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { createTrustCommand, type TrustMachine } from "./command.ts";

let folder: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "halonic-cli-trust-key-addresses-"));
  const files: Record<string, string> = {
    "workspace.yaml": "id: acme\nname: Acme\n",
    "providers/gateway.yaml":
      "id: gateway\ntype: openai-compatible\nbaseUrl: https://other.example.com/v1\nsecret: gw-key\n",
  };
  for (const [path, text] of Object.entries(files)) {
    const file = join(folder, "acme", path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

verifies("cli.workspace-provider-key-trust", () => {
  it("says when a provider's key isn't allowed to go where the provider sends it (HAL-15346)", async () => {
    const asked: string[] = [];
    const machine = (): TrustMachine => ({
      store: new FileTrustStore(join(folder, "profile", "trust")),
      clock: fixedClock(Date.UTC(2026, 10, 3, 12)),
      commandSearch: { path: undefined, endings: [] },
      keyOrigins: {
        allowedOrigins: async (name) => {
          asked.push(name);
          return ["https://llm.example.com"];
        },
      },
    });
    const io = captureIo(folder);

    const code = await runCli(["trust", "--dir", "acme"], io, [createTrustCommand(machine)]);

    // Through pipes the check goes to stderr and only the fingerprint to stdout.
    expect(code).toBe(exitCode.notTrusted);
    expect(asked).toEqual(["gw-key"]);
    expect(io.stderr).not.toContain("Sends its key to");
    expect(io.stderr).toContain(
      '                ! https://other.example.com isn\'t allowed for key "gw-key", so a run that uses this provider fails. To allow it, run: halonic models allow-address gw-key https://other.example.com',
    );
  });
});
