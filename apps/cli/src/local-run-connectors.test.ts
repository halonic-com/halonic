import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { MemoryTokenStore } from "@halonicjs/adapter-memory";
import { ConnectorFactories } from "@halonicjs/app";
import type { RunVersion } from "@halonicjs/events";
import type { ConnectorFactory, TrustGrant } from "@halonicjs/ports";
import { contractGrant } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  type LocalRunConnectors,
  localRunConnectors,
  type RunConnectorsEngine,
} from "./local-run-connectors.ts";

const acmeExample = fileURLToPath(new URL("../../../examples/acme", import.meta.url));

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-run-connectors-"));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

/**
 * The runs' connectors on an empty workspace, whose program folder is
 * `folder`; the errors they report go to `reported`. With `versions`, the
 * engine's runs read several versions of the workspace; each connector
 * created goes to `created`.
 */
function connectorsOn(
  options: {
    readonly reported?: unknown[];
    readonly versions?: RunConnectorsEngine["versions"];
    readonly created?: Created[];
  } = {},
): LocalRunConnectors {
  const stdio: ConnectorFactory = {
    transport: "stdio",
    create: (config, context) => {
      options.created?.push({ id: config.id, trust: context.trust });
      return {
        id: config.id,
        listTools: async () => [],
        callTool: async () => "",
        close: async () => {},
      };
    },
  };
  return localRunConnectors(
    {
      factories: new ConnectorFactories([stdio]),
      context: {
        http: { fetch: async () => new Response("unused") },
        tokens: new MemoryTokenStore(),
      },
      trust: null,
    },
    {
      workspace: { files: [] } as unknown as LoadedWorkspace,
      ...(options.versions === undefined ? {} : { versions: options.versions }),
      location: folder,
      secrets: { get: async () => null },
      programFolders: {
        folderFor: async () => ({ path: folder, release: async () => {} }),
        close: async () => {},
      },
      reportError: (error) => options.reported?.push(error),
    },
  );
}

verifies("cli.local-engine", () => {
  it("keeps sending off for every connector, saying why", async () => {
    const { connectorCalls } = connectorsOn().runs;

    const check = await connectorCalls.sending.checkSending({
      location: folder,
      connector: "mail",
    });

    expect(check).toEqual({
      allowed: false,
      reason: `sending is off for the connector "mail": the CLI can't switch it on yet`,
    });
  });

  it("names the connector whose sending settings couldn't be read", () => {
    const reported: unknown[] = [];
    const { connectorCalls } = connectorsOn({ reported }).runs;

    connectorCalls.reportSettingsError("mail", new Error("settings file unreadable"));

    expect(reported).toEqual([
      new Error(
        `The sending settings of the connector "mail" couldn't be read: settings file unreadable`,
      ),
    ]);
  });

  it("starts a run's connectors from the version it read, with that version's grant", async () => {
    const asked: RunVersion[] = [];
    const created: Created[] = [];
    const read = await acmeWithNotes();
    const { runConnectors } = connectorsOn({
      created,
      versions: {
        trustedVersionOf: async (version) => {
          asked.push(version);
          return { workspace: read, trust: contractGrant };
        },
      },
    }).runs;

    const clients = await runConnectors.open(reportRun);

    expect(asked).toEqual([reportRun.version]);
    expect(clients.map((client) => client.id)).toEqual(["notes"]);
    expect(created).toEqual([{ id: "notes", trust: contractGrant }]);
  });

  it("starts no connector of a run whose version may not run here, saying why", async () => {
    const created: Created[] = [];
    const { runConnectors } = connectorsOn({
      created,
      versions: {
        trustedVersionOf: async () => {
          throw new Error("Acme changed since it was trusted.");
        },
      },
    }).runs;

    await expect(runConnectors.open(reportRun)).rejects.toThrow(
      "Acme changed since it was trusted.",
    );
    expect(created).toEqual([]);
  });
});

/** A connector the factory created, and the grant it was created with. */
interface Created {
  readonly id: string;
  readonly trust: TrustGrant | null;
}

/** A run of Weekly report that read a live version. */
const reportRun = {
  runId: "run_1",
  hubId: "reports",
  workflowId: "weekly-report",
  version: {
    reads: "live-version",
    commit: "4f2a9c1",
    versionDate: "2026-11-10T09:00:00.000Z",
  },
  localOnly: false,
} as const;

/** Acme as a version that has the connector `notes`, in a copy under `folder`. */
async function acmeWithNotes(): Promise<LoadedWorkspace> {
  const acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
  await mkdir(join(acme, "library", "connectors"), { recursive: true });
  await writeFile(
    join(acme, "library", "connectors", "notes.connector.yaml"),
    "id: notes\nname: Notes\ntransport:\n  stdio:\n    command: node\n",
  );
  return await loadWorkspace(new FolderDefinitionStore(acme, "./acme"));
}
