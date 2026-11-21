import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { pluginsFolder, profileFolder } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { smallWorkspace, validateIn, writeFiles } from "../../test/validate-workspace.ts";
import { nodeProfileEnvironment } from "../../workspace-runs.ts";

const notAdded =
  "The plugin acme-orders isn't added, so it has no tools yet. Add it with halonic plugin add <folder or git address>.";

let folder: string;
let workspace: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "halonic-cli-plugin-not-added-"));
  workspace = join(folder, "acme");
  // `validate` reads the plugins of this process's profile.
  vi.stubEnv("HALONIC_HOME", join(folder, "profile"));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await removeTestFolder(folder);
});

/** The small workspace with a connector `orders` to the plugin `plugin`. */
function withConnectorTo(plugin: string): void {
  writeFiles(workspace, {
    ...smallWorkspace,
    "library/connectors/orders.connector.yaml": `id: orders\ntransport:\n  plugin: { id: ${plugin} }\n`,
  });
}

/** Adds the plugin `acme-orders` to the profile, as `plugin add` leaves it: off until trusted. */
function addOrdersPlugin(): void {
  writeFiles(join(pluginsFolder(profileFolder(nodeProfileEnvironment())), "acme-orders"), {
    "plugin.yaml": "id: acme-orders\nversion: 1.0.0\nsdk: 1\nname: Acme orders\n",
  });
}

verifies("cli.commands.validate.plugin-not-added", () => {
  it("warns on the connector's file when its plugin isn't added, and still passes", async () => {
    withConnectorTo("acme-orders");

    const { code, io } = await validateIn(workspace);

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toContain(`library${sep}connectors${sep}orders.connector.yaml`);
    expect(io.stdout.join("\n")).toContain(`! ${notAdded}  (plugin-not-added)`);
  });

  it("names the added plugin whose id is close", async () => {
    addOrdersPlugin();
    withConnectorTo("acme-order");

    const { io } = await validateIn(workspace, "--json");

    const report = JSON.parse(io.stdout.join("\n")) as { problems: { message: string }[] };
    expect(report.problems.map((problem) => problem.message)).toEqual([
      "The plugin acme-order isn't added, so it has no tools yet. Add it with halonic plugin add <folder or git address>. Did you mean acme-orders?",
    ]);
  });

  it("says nothing for a plugin that is added, even while it's off", async () => {
    addOrdersPlugin();
    withConnectorTo("acme-orders");

    const { code, io } = await validateIn(workspace);

    expect(code).toBe(exitCode.ok);
    expect(io.stdout.join("\n")).not.toContain("plugin-not-added");
  });
});
