import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FileTrustStore } from "@halonicjs/adapter-fs-node";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { createTrustCommand } from "./command.ts";

let folder: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "halonic-cli-trust-plugin-hosts-"));
  const files: Record<string, string> = {
    "workspace.yaml": "id: acme\nname: Acme\n",
    "library/connectors/orders.connector.yaml":
      "name: Orders\ntransport:\n  plugin: { id: acme-orders }\ntools:\n  approve: []\n",
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

verifies("cli.trust-check", () => {
  it("shows under a plugin connector the hosts of the plugin installed here", async () => {
    const machine = () => ({
      store: new FileTrustStore(join(folder, "profile", "trust")),
      clock: fixedClock(Date.UTC(2026, 10, 3, 12)),
      commandSearch: { path: undefined, endings: [] },
      pluginHosts: async () => new Map([["acme-orders", ["api.acme.example"]]]),
    });
    const io = captureIo(folder);

    await runCli(["trust", "--dir", "acme"], io, [createTrustCommand(machine)]);

    // Through pipes the check goes to stderr and only the fingerprint to stdout.
    expect(io.stderr).toContain("  orders        plugin acme-orders");
    expect(io.stderr).toContain("                Reaches api.acme.example.");
  });
});
