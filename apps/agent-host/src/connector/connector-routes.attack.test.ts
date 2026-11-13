import { symlink } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openBody, post, type Setup, startRoutes } from "./connector-routes.test-helper.ts";

/**
 * Attacks from a caller that holds the launch token, such as a compromised
 * page: it may not widen a connector's place, name a workspace the launcher
 * didn't, or reach a connector it didn't open.
 */

let setup: Setup | undefined;

afterEach(async () => {
  await setup?.close();
  setup = undefined;
});

async function started(): Promise<Setup> {
  setup = await startRoutes();
  return setup;
}

describe("the connector routes under attack", () => {
  it("ignores a sandbox profile sent with the connector: the body takes no such field, 400", async () => {
    const { url, folders, made } = await started();
    const profile = { deniedPaths: [], readOnlyPaths: ["/"], network: { allowedSites: ["*"] } };
    const response = await post(url, "/v1/connectors/open", { ...openBody(folders), profile });
    expect(response.status).toBe(400);
    expect(made).toEqual([]);
  });

  it("refuses a workspace the launcher didn't name, 403, and starts nothing", async () => {
    const { url, folders, made } = await started();
    const response = await post(
      url,
      "/v1/connectors/open",
      openBody(folders, { workspaceRoot: folders.other }),
    );
    expect(response.status).toBe(403);
    expect(made).toEqual([]);
  });

  it("refuses a workspace that is a parent or a missing folder of one it named", async () => {
    const { url, folders, made } = await started();
    for (const workspaceRoot of [folders.base, join(folders.workspace, "..", "nowhere")]) {
      const response = await post(url, "/v1/connectors/open", openBody(folders, { workspaceRoot }));
      expect(response.status).toBe(403);
    }
    expect(made).toEqual([]);
  });

  it("refuses a link to a folder the launcher didn't name, since it checks the real path", async () => {
    const { url, folders, made } = await started();
    const link = join(folders.base, "link-to-other");
    await symlink(folders.other, link);
    const response = await post(
      url,
      "/v1/connectors/open",
      openBody(folders, { workspaceRoot: link }),
    );
    expect(response.status).toBe(403);
    expect(made).toEqual([]);
  });

  it("accepts the named workspace through a link", async () => {
    const { url, folders } = await started();
    const link = join(folders.base, "link-to-workspace");
    await symlink(folders.workspace, link);
    const response = await post(
      url,
      "/v1/connectors/open",
      openBody(folders, { workspaceRoot: link }),
    );
    expect(response.status).toBe(200);
  });

  it("refuses a relative workspace or working folder, 400", async () => {
    const { url, folders } = await started();
    for (const change of [{ workspaceRoot: "workspace" }, { workingFolders: ["files/agents"] }]) {
      expect((await post(url, "/v1/connectors/open", openBody(folders, change))).status).toBe(400);
    }
  });

  it("refuses a missing trust grant, 400", async () => {
    const { url, folders } = await started();
    const { trust: _trust, ...withoutTrust } = openBody(folders);
    expect((await post(url, "/v1/connectors/open", withoutTrust)).status).toBe(400);
  });

  it("refuses an unknown connector on every route, 404", async () => {
    const { url } = await started();
    const unknown = { connector: "not-made-by-the-host" };
    for (const [path, body] of [
      ["tools", unknown],
      ["call", { ...unknown, tool: "echo", args: {} }],
      ["close", unknown],
    ] as const) {
      expect((await post(url, `/v1/connectors/${path}`, body)).status).toBe(404);
    }
  });

  it("refuses a request without the launch token, 401", async () => {
    const { url, folders } = await started();
    const response = await fetch(`${url}/v1/connectors/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(openBody(folders)),
    });
    expect(response.status).toBe(401);
  });

  it("closes a connector once: closing it again finds nothing", async () => {
    const { url, folders, made } = await started();
    const opened = (await (await post(url, "/v1/connectors/open", openBody(folders))).json()) as {
      connector: string;
    };
    expect((await post(url, "/v1/connectors/close", opened)).status).toBe(200);
    expect((await post(url, "/v1/connectors/close", opened)).status).toBe(404);
    expect(made[0]?.closeCount).toBe(1);
  });
});
