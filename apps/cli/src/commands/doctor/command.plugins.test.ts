import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { AddedPlugin } from "../../connector-plugin.ts";
import type { DoctorMachine } from "../../doctor-machine.ts";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { profilePlatformOf } from "../../workspace-runs.ts";
import { createDoctorCommand } from "./command.ts";

let folder: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "halonic-cli-doctor-plugins-"));
});

afterEach(async () => {
  await removeTestFolder(folder);
});

/** A computer with a ready sandbox, free disk, no harness and these plugins added. */
function machine(added: readonly AddedPlugin[], read: string[] = []): DoctorMachine {
  return {
    profile: { platform: profilePlatformOf(process.platform), root: join(folder, "profile") },
    trustStore: {
      get: async () => null,
      grant: async () => {},
      revoke: async () => {},
      list: async () => [],
    },
    sandbox: {
      check: async () => ({ ok: true, reason: null, missing: [] }),
      capabilities: () => ({ files: "shared", strength: "os" }),
    },
    sandboxKind: "bubblewrap",
    probe: {
      engineMemory: async () => 0,
      childProcesses: async () => [],
      folderSize: async () => ({ bytes: 0, complete: true }),
      freeDisk: async () => 48 * 1024 ** 3,
    },
    harnesses: [],
    http: { fetch: async () => new Response("{}") },
    system: "Linux x64",
    signInShell: "sh",
    plugins: async () => {
      read.push("plugins");
      return added;
    },
  };
}

/**
 * Acme on the test model, whose agent Helper uses the connector `orders`,
 * a plugin's connector, and `pluginId` as the plugin it names.
 */
function writeAcme(pluginId: string, helperConnectors = "[orders]"): void {
  const files: Record<string, string> = {
    "workspace.yaml": "id: acme\nname: Acme\n",
    "models.yaml": "aliases:\n  default:\n    provider: mock\n    model: echo\n",
    "providers/mock.yaml": "id: mock\nname: Test model\ntype: mock\nlocal: true\n",
    "library/connectors/orders.connector.yaml": `name: Orders\ntransport:\n  plugin:\n    id: ${pluginId}\n`,
    "hubs/support/hub.yaml": "id: support\nname: Support\n",
    "hubs/support/agents/helper.agent.yaml": `id: helper\nname: Helper\ninstructions: Help.\nconnectors: ${helperConnectors}\n`,
  };
  for (const [path, text] of Object.entries(files)) {
    const file = join(folder, "acme", path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
}

async function doctor(computer: DoctorMachine, json = false) {
  const io = captureIo(folder);
  const args = ["doctor", "--dir", "acme", ...(json ? ["--json"] : [])];
  const code = await runCli(args, io, [createDoctorCommand(() => computer)]);
  return { code, lines: io.stdout };
}

/** The lines of the one check whose line starts with `label`, after its mark. */
function check(lines: readonly string[], label: string): string[] {
  const start = lines.findIndex((line) => line.slice(2).startsWith(label));
  if (start === -1) return [];
  const end = lines.findIndex((line, index) => index > start && !line.startsWith(" "));
  return lines.slice(start, end);
}

verifies("cli.doctor-plugins", () => {
  it("fails a Plugins line for a connector's plugin that isn't added, naming a near one, and exits with 1", async () => {
    writeAcme("acme-order");

    const { code, lines } = await doctor(machine([{ id: "acme-orders", state: "on" }]));

    expect(code).toBe(exitCode.failed);
    expect(check(lines, "Plugins")).toEqual([
      "✕ Plugins     orders uses the plugin acme-order, which isn't added, so orders has no tools yet.",
      "              Did you mean acme-orders?",
      "              Fix: change the plugin id in orders.connector.yaml to acme-orders, or add acme-order with halonic plugin add <folder or git address>, then run halonic doctor again.",
    ]);
    // After Workspace (and its Secrets and Models lines), before Sandbox.
    expect(lines.findIndex((line) => line.includes("Plugins"))).toBeLessThan(
      lines.findIndex((line) => line.includes("Sandbox")),
    );
    expect(lines.at(-1)).toMatch(/^1 problem\./u);
  });

  it("gives the fix that adds a plugin when no added one is close", async () => {
    writeAcme("acme-orders");

    const { lines } = await doctor(machine([]));

    expect(check(lines, "Plugins")).toEqual([
      "✕ Plugins     orders uses the plugin acme-orders, which isn't added, so orders has no tools yet.",
      "              Fix: add it with halonic plugin add <folder or git address>, then run halonic doctor again.",
    ]);
  });

  it("warns about a plugin that is off or can't be read, and still exits with 0", async () => {
    writeAcme("acme-orders");

    const changed = await doctor(machine([{ id: "acme-orders", state: "changed" }]));
    const notTrusted = await doctor(machine([{ id: "acme-orders", state: "notTrusted" }]));
    const broken = await doctor(machine([{ id: "acme-orders", state: "broken" }]));

    expect(changed.code).toBe(exitCode.ok);
    expect(check(changed.lines, "Plugins")).toEqual([
      "! Plugins     acme-orders is off: changed since you trusted it · halonic trust --plugin acme-orders",
    ]);
    expect(check(notTrusted.lines, "Plugins")).toEqual([
      "! Plugins     acme-orders is off: not trusted yet · halonic trust --plugin acme-orders",
    ]);
    expect(check(broken.lines, "Plugins")).toEqual([
      "! Plugins     acme-orders can't be read or checked, so it's off.",
      "              Fix: remove it with halonic plugin remove acme-orders, then add a version that works.",
    ]);
  });

  it("has no Plugins line when the plugin is on, and doesn't read the plugins when no agent uses one", async () => {
    writeAcme("acme-orders");
    const on = await doctor(machine([{ id: "acme-orders", state: "on" }]));
    writeAcme("acme-orders", "[]");
    const read: string[] = [];
    const unused = await doctor(machine([], read));

    expect(check(on.lines, "Plugins")).toEqual([]);
    expect(check(unused.lines, "Plugins")).toEqual([]);
    expect(read).toEqual([]);
  });

  it("gives the check as plugins in --json", async () => {
    writeAcme("acme-order");

    const { lines } = await doctor(machine([{ id: "acme-orders", state: "on" }]), true);

    expect(JSON.parse(lines.join("\n")).checks).toContainEqual({
      check: "plugins",
      status: "failed",
      problems: [
        { problem: "not-added", connector: "orders", plugin: "acme-order", near: "acme-orders" },
      ],
    });
  });
});
