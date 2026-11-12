// The example data of the tools checklist (HAL-2883): the trusted Acme
// workspace with the connector `notes-mcp`, with `send` approved and
// `archive` never approved.

import { cpSync, mkdtempSync } from "node:fs";
import { mkdir, mkdtemp, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileToolApprovalStore, FileTrustStore } from "@halonicjs/adapter-fs-node";
import type { ProgramStarter } from "@halonicjs/adapter-mcp";
import { MemoryTokenStore } from "@halonicjs/adapter-memory";
import type { ToolApproval, ToolApprovalKey, ToolApprovalStore } from "@halonicjs/ports";
import { fixedClock } from "@halonicjs/std";
import type { CliCommand } from "../command.ts";
import { toolsCommandWith } from "../commands/tools/command.ts";
import type { ToolsMachine } from "../commands/tools/source.ts";
import { cliConnectorFactories } from "../connector-machine.ts";
import { webCryptoDigest } from "../workspace-runs.ts";

const noCommands = { path: undefined, endings: [] };
const clock = fixedClock(Date.UTC(2026, 10, 11, 9));

/** The connector file of `notes-mcp`, a stdio program. */
export function notesConnector(): string {
  return "name: Notes server\ntransport:\n  stdio:\n    command: notes-mcp\ntools:\n  approve: all\n";
}

/** Acme in a temporary folder, and the approvals a test starts from. */
export interface AcmeNotes {
  /** The workspace folder: run the commands from here. */
  readonly acme: string;
  /** Every connector program a command tried to start: `revoke` starts none. */
  readonly started: string[];
  /**
   * The commands, on a fresh copy of the approvals a test starts from, so
   * each golden mode starts from the same state.
   */
  commands(): CliCommand[];
  /** The commands on the approvals the test started from, so what one run changes the next one sees. */
  sharedCommands(): CliCommand[];
  /** The approvals the test started from. */
  readonly approvals: ToolApprovalStore;
  /** The approvals' key of one of `notes-mcp`'s tools. */
  key(name: string): Promise<{ location: string; source: string; name: string }>;
  /** Damages every approval file, as a disk error or a hand edit would, so none can be read. */
  damageApprovals(): Promise<void>;
  /** Removes the temporary folder. */
  remove(): Promise<void>;
}

/** Acme with `notes-mcp`, and `send` approved. */
export async function acmeNotes(): Promise<AcmeNotes> {
  const folder = await mkdtemp(join(tmpdir(), "halonic-cli-tools-"));
  const acme = join(folder, "acme");
  await writeAcme(acme);
  const started: string[] = [];
  const noPrograms: ProgramStarter = {
    start: (launch) => {
      started.push(launch.program);
      return Promise.reject(new Error("This test starts no connector."));
    },
  };
  const trustStore = new FileTrustStore(join(folder, "trust"));
  const seed = join(folder, "approvals");
  const approvals = new FileToolApprovalStore(seed);

  const machineWith = (folderOfApprovals: string): ToolsMachine => ({
    factories: cliConnectorFactories(noPrograms, { PATH: "/usr/bin" }),
    http: { fetch: () => Promise.reject(new TypeError("This test reaches no server.")) },
    tokens: new MemoryTokenStore(),
    trustStore,
    clock,
    commandSearch: noCommands,
    approvals: new FileToolApprovalStore(folderOfApprovals),
    digest: webCryptoDigest,
  });
  const key = async (name: string) => ({
    location: await realpath(acme),
    source: "notes-mcp",
    name,
  });

  await approvals.approve(sendApproved(await key("send")));

  return {
    acme,
    started,
    commands() {
      const copy = mkdtempSync(join(folder, "approvals-"));
      cpSync(seed, copy, { recursive: true });
      return [toolsCommandWith(() => machineWith(copy))];
    },
    sharedCommands: () => [toolsCommandWith(() => machineWith(seed))],
    approvals,
    key,
    async damageApprovals() {
      const files = await readdir(seed, { recursive: true, withFileTypes: true });
      for (const file of files) {
        if (file.isFile() && file.name !== "waiting.json" && file.name !== "lock") {
          await writeFile(join(file.parentPath, file.name), "{");
        }
      }
    },
    remove: () => rm(folder, { recursive: true, force: true }),
  };
}

/** `send` approved, at a made-up fingerprint: `revoke` reads only that it is there. */
function sendApproved(key: ToolApprovalKey): ToolApproval {
  return {
    ...key,
    server: {
      kind: "stdio",
      command: "notes-mcp",
      args: [],
      pin: null,
      cwd: ".",
      env: null,
      secretEnv: null,
    },
    fingerprint: `htl1:${"0".repeat(64)}`,
    tool: { name: "send", description: "Sends a note to a contact.", parameters: {} },
    approvedAt: new Date(clock.now()).toISOString(),
  };
}

/** Acme's `workspace.yaml` and its `notes-mcp` connector. */
async function writeAcme(acme: string): Promise<void> {
  await mkdir(join(acme, "library", "connectors"), { recursive: true });
  await writeFile(join(acme, "workspace.yaml"), "id: acme\nname: Acme\n");
  await writeFile(
    join(acme, "library", "connectors", "notes-mcp.connector.yaml"),
    notesConnector(),
  );
}
