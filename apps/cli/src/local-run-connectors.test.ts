import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryTokenStore } from "@halonicjs/adapter-memory";
import { ConnectorFactories } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it } from "vitest";
import { type LocalRunConnectors, localRunConnectors } from "./local-run-connectors.ts";

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-run-connectors-"));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

/**
 * The runs' connectors on an empty workspace, whose program folder is
 * `folder`; the errors they report go to `reported`.
 */
function connectorsOn(readsOneVersion: boolean, reported: unknown[] = []): LocalRunConnectors {
  return localRunConnectors(
    {
      factories: new ConnectorFactories([]),
      context: {
        http: { fetch: async () => new Response("unused") },
        tokens: new MemoryTokenStore(),
      },
      trust: null,
    },
    {
      workspace: { files: [] } as unknown as LoadedWorkspace,
      readsOneVersion,
      location: folder,
      secrets: { get: async () => null },
      programFolders: {
        folderFor: async () => ({ path: folder, release: async () => {} }),
        close: async () => {},
      },
      reportError: (error) => reported.push(error),
    },
  );
}

verifies("cli.local-engine", () => {
  it("keeps sending off for every connector, saying why", async () => {
    const { connectorCalls } = connectorsOn(true).runs;

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
    const { connectorCalls } = connectorsOn(true, reported).runs;

    connectorCalls.reportSettingsError("mail", new Error("settings file unreadable"));

    expect(reported).toEqual([
      new Error(
        `The sending settings of the connector "mail" couldn't be read: settings file unreadable`,
      ),
    ]);
  });

  it("starts no connector of a run in an engine over several versions", async () => {
    const { runConnectors } = connectorsOn(false).runs;
    const run = {
      runId: "run_1",
      hubId: "support",
      workflowId: "support-reply",
      version: { reads: "saved-files" },
      localOnly: false,
    } as const;

    await expect(runConnectors.open(run)).rejects.toThrow(
      `Run "run_1" read one of several versions of the workspace, and its connectors can't start from those yet.`,
    );
  });
});
