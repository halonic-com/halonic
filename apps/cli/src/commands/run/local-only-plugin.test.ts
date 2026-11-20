import { mkdtempSync } from "node:fs";
import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProfileEnvironment } from "@halonicjs/profile";
import { pluginsFolder, profileFolder } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { testRunSetup } from "../../test/run-setup.ts";
import { nodeProfileEnvironment } from "../../workspace-runs.ts";
import { validateCommand } from "../validate/command.ts";
import { runCommandWith } from "./command.ts";

/** The Acme example, which starts local only, on the test model. */
const acmeExample = fileURLToPath(new URL("../../../../../examples/acme", import.meta.url));

/** A connector to the plugin acme-orders that says it runs on this computer. */
const ordersConnector = "name: Orders\nlocal: true\ntransport:\n  plugin: { id: acme-orders }\n";

let folder: string;
let acme: string;
let profile: ProfileEnvironment;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-local-only-plugin-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
  await mkdir(join(acme, "library/connectors"), { recursive: true });
  await writeFile(join(acme, "library/connectors/orders.connector.yaml"), ordersConnector);
  const home = mkdtempSync(join(folder, "profile-"));
  profile = { ...nodeProfileEnvironment(), variables: { HALONIC_HOME: home } };
  // `validate` reads the plugins of this process's profile.
  vi.stubEnv("HALONIC_HOME", home);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await removeTestFolder(folder);
});

/** Installs the plugin acme-orders, whose backend may reach `host`. */
async function installOrders(host: string): Promise<void> {
  const plugin = join(pluginsFolder(profileFolder(profile)), "acme-orders");
  await mkdir(join(plugin, "backend"), { recursive: true });
  const manifest = [
    "id: acme-orders",
    "version: 1.0.0",
    "sdk: 1",
    "name: Acme orders",
    "backend:",
    `  hosts: [${host}]`,
    "  tools:",
    "    - { name: find-order, description: Finds an order., risk: read, untrusted: true }",
    "",
  ].join("\n");
  await writeFile(join(plugin, "plugin.yaml"), manifest);
  await writeFile(join(plugin, "backend/index.js"), "export default {};\n");
}

verifies("workspace.local-only-sheet-hosts", () => {
  it("fails validate and refuses the run when the plugin reaches an outside host", async () => {
    await installOrders("api.acme.example");

    const validating = captureIo(acme);
    const validated = await runCli(["validate"], validating, [validateCommand]);
    const running = captureIo(acme);
    const ran = await runCli(["run", "support-reply"], running, [
      runCommandWith(testRunSetup(folder, profile)),
    ]);

    expect(validated).toBe(exitCode.failed);
    expect(validating.stdout.join("\n")).toContain(
      "The plugin acme-orders reaches api.acme.example, so it isn't local: set privacy.localOnly: false in workspace.yaml to use it",
    );
    expect(ran).toBe(exitCode.usage);
    expect(running.stderr[0]).toBe(
      "✕ Couldn't run support-reply: Acme has 1 problem in its files. Nothing ran.",
    );
  });

  it("passes validate when the plugin reaches only this computer", async () => {
    await installOrders("orders.localhost");
    const io = captureIo(acme);

    expect(await runCli(["validate"], io, [validateCommand])).toBe(exitCode.ok);
  });
});
