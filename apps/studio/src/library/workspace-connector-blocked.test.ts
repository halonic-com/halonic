import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import type { DefinitionWatchListener } from "@halonicjs/ports";
import { RefusalsFeed } from "@halonicjs/studio-feature-library/api";
import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { WorkspaceConnectorStatus } from "./workspace-connector-status.ts";

const noGoogle = { list: async () => [], subscribe: () => () => {} };

/** Acme's `workspace.yaml`, local only or not. */
function workspaceYaml(localOnly: boolean): string {
  return `id: acme\nname: Acme\nprivacy:\n  localOnly: ${localOnly}\n`;
}

/** Acme's three connectors: an MCP server on the web, a local program and a Google account. */
function acmeFiles(localOnly: boolean, searchExtra = ""): MemoryDefinitionStore {
  return new MemoryDefinitionStore({
    "workspace.yaml": workspaceYaml(localOnly),
    "library/connectors/search.connector.yaml": `version: 1\nid: search\n${searchExtra}transport: { http: { url: https://search.acme.example/mcp } }\n`,
    "library/connectors/notes.connector.yaml":
      "version: 1\nid: notes\ntransport: { stdio: { command: acme-notes } }\n",
    "library/connectors/mail.connector.yaml":
      "version: 1\nid: mail\ntransport: { google: { account: sam@acme.example } }\n",
  });
}

/** The ids of the connectors the status lists as blocked. */
async function blockedIds(status: WorkspaceConnectorStatus): Promise<string[]> {
  const listed = await status.list();
  return listed.filter(({ blocked }) => blocked === true).map(({ id }) => id);
}

verifies("studio.workspace-connector-blocked", () => {
  it("marks the connectors that aren't local as blocked in a local-only workspace", async () => {
    const status = new WorkspaceConnectorStatus({
      definitions: acmeFiles(true),
      refusals: new RefusalsFeed(),
      google: noGoogle,
    });

    expect(await blockedIds(status)).toEqual(["mail", "search"]);
  });

  it("keeps the state a blocked connector has", async () => {
    const status = new WorkspaceConnectorStatus({
      definitions: acmeFiles(true),
      refusals: new RefusalsFeed(),
      google: noGoogle,
    });

    const search = (await status.list()).find(({ id }) => id === "search");

    expect(search).toMatchObject({ state: "not-checked", blocked: true });
  });

  it("follows the connector file's own local setting", async () => {
    const status = new WorkspaceConnectorStatus({
      definitions: acmeFiles(true, "local: true\n"),
      refusals: new RefusalsFeed(),
      google: noGoogle,
    });

    expect(await blockedIds(status)).toEqual(["mail"]);
  });

  it("blocks nothing in a workspace that isn't local only", async () => {
    const status = new WorkspaceConnectorStatus({
      definitions: acmeFiles(false),
      refusals: new RefusalsFeed(),
      google: noGoogle,
    });

    const listed = await status.list();

    expect(listed.some((connector) => "blocked" in connector)).toBe(false);
  });

  it("tells its listeners when the workspace turns local only", async () => {
    const definitions = acmeFiles(false);
    let watching: DefinitionWatchListener | undefined;
    vi.spyOn(definitions, "watch").mockImplementation(async (listener) => {
      watching = listener;
      return { close: async () => {} };
    });
    const status = new WorkspaceConnectorStatus({
      definitions,
      refusals: new RefusalsFeed(),
      google: noGoogle,
    });
    const heard = vi.fn();
    const stop = status.subscribe(heard);
    await waitUntil("the files to be watched", () => watching !== undefined);
    expect(await blockedIds(status)).toEqual([]);

    await definitions.write("workspace.yaml", workspaceYaml(true));
    watching?.changed([{ path: "workspace.yaml", kind: "changed" }]);

    expect(heard).toHaveBeenCalledTimes(1);
    expect(await blockedIds(status)).toEqual(["mail", "search"]);
    stop();
  });
});
