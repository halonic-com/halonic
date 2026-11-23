import { appendFile, mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileRecordStore } from "@halonicjs/adapter-fs-node";
import { pluginInstallsCollection } from "@halonicjs/app";
import type { RecordChange, RecordStore } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { DoctorMachine } from "../../doctor-machine.ts";
import { pluginRecordProblem } from "../../doctor-plugin-records.ts";
import { exitCode } from "../../exit-code.ts";
import { shellWord } from "../../output/shell-word.ts";
import { pluginRecordStore } from "../../plugin-host.ts";
import { PluginRecordStore } from "../../plugin-record-store.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { profilePlatformOf } from "../../workspace-runs.ts";
import { createDoctorCommand } from "./command.ts";

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-doctor-plugin-records-"));
});

afterEach(async () => {
  await removeTestFolder(folder);
});

const profile = () => ({
  platform: profilePlatformOf(process.platform),
  root: join(folder, "profile"),
});

/**
 * A computer with a ready sandbox, free disk and no harness, whose plugin
 * records are `records`, the profile's own by default, and whose added
 * plugins are read through them, as `halonic plugin list` reads them.
 */
function machine(records: RecordStore = pluginRecordStore(profile())): DoctorMachine {
  return {
    profile: profile(),
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
      await records.changes(pluginInstallsCollection);
      return [];
    },
    pluginRecords: () => pluginRecordProblem(records),
  };
}

/** The record of where the plugin `id` was added from, as `halonic plugin add` keeps it. */
function sourceRecord(id: string): RecordChange {
  return {
    at: "2026-11-22T09:00:00.000Z",
    collection: pluginInstallsCollection,
    id,
    op: "add",
    values: { source: `/sources/${id}` },
  };
}

/** The record file that keeps where each plugin was added from, with one record and then `line`. */
async function damagedSources(line = "not a record"): Promise<string> {
  const records = join(folder, "profile", "plugin-records");
  await new FileRecordStore(records).append([sourceRecord("weather")]);
  const [name] = await readdir(records);
  const file = join(records, name ?? "");
  await appendFile(file, `${line}\n`);
  return file;
}

/** Acme, whose agent Helper uses the connector `orders`, which names the plugin `weather`. */
async function writeAcme(): Promise<void> {
  const files: Record<string, string> = {
    "workspace.yaml": "id: acme\nname: Acme\n",
    "library/connectors/orders.connector.yaml":
      "name: Orders\ntransport:\n  plugin:\n    id: weather\n",
    "hubs/support/hub.yaml": "id: support\nname: Support\n",
    "hubs/support/agents/helper.agent.yaml":
      "id: helper\nname: Helper\ninstructions: Help.\nconnectors: [orders]\n",
  };
  for (const [path, text] of Object.entries(files)) {
    const file = join(folder, "acme", path);
    await mkdir(join(file, ".."), { recursive: true });
    await writeFile(file, text);
  }
}

async function doctor(computer: DoctorMachine, args: readonly string[] = []) {
  const io = captureIo(folder);
  const code = await runCli(["doctor", ...args], io, [createDoctorCommand(() => computer)]);
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
  it("names a damaged plugin record file outside a workspace, with plugin list's fix, and exits with 0", async () => {
    const file = await damagedSources();

    const { code, lines } = await doctor(machine());

    expect(code).toBe(exitCode.ok);
    expect(check(lines, "Plugins")).toEqual([
      `! Plugins     The plugin record file ${file} is damaged at line 2: it is not JSON.`,
      "              Fix: delete line 2 from it, or delete the file, then run halonic doctor again. Deleting the file forgets where each plugin was added from; the plugins stay.",
    ]);
  });

  it("names a plugin record file the person may not open, with chmod 600", async () => {
    const records = join(folder, "profile", "plugin-records");
    const file = join(records, "1f0e.jsonl");
    const denied = Object.assign(new Error("EACCES: permission denied, open"), {
      code: "EACCES",
      path: file,
    });
    const refusing = new PluginRecordStore(
      {
        append: async () => {},
        compact: async () => {},
        changes: async () => {
          throw denied;
        },
      },
      records,
    );

    const { code, lines } = await doctor(machine(refusing), ["--json"]);

    expect(code).toBe(exitCode.ok);
    expect(JSON.parse(lines.join("\n")).checks).toContainEqual({
      check: "plugins",
      status: "warning",
      problems: [
        {
          problem: "records-unreadable",
          place: "file",
          path: file,
          access: process.platform === "win32" ? "windows" : "yours",
        },
      ],
    });
    if (process.platform === "win32") return;
    const shown = await doctor(machine(refusing));
    expect(check(shown.lines, "Plugins")).toEqual([
      `! Plugins     The plugin record file ${file} can't be read by you.`,
      `              Fix: run chmod 600 ${shellWord(file)}, then run halonic doctor again.`,
    ]);
  });

  it("names only the record file when a connector's plugin can't be read because of it", async () => {
    await writeAcme();
    const file = await damagedSources();

    const { lines } = await doctor(machine(), ["--dir", "acme"]);

    expect(check(lines, "Plugins")).toEqual([
      `! Plugins     The plugin record file ${file} is damaged at line 2: it is not JSON.`,
      "              Fix: delete line 2 from it, or delete the file, then run halonic doctor again. Deleting the file forgets where each plugin was added from; the plugins stay.",
    ]);
  });

  it("has no Plugins line when the plugin records read, or there are none yet", async () => {
    const none = await doctor(machine());
    await damagedSources(JSON.stringify(sourceRecord("tides")));
    const whole = await doctor(machine());

    expect(check(none.lines, "Plugins")).toEqual([]);
    expect(check(whole.lines, "Plugins")).toEqual([]);
  });
});
