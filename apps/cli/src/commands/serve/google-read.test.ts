import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { createServer } from "@halonicjs/host-server";
import { profileFolder, workspaceFolders } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openGoogleHost } from "../../google-host.ts";
import { committedVersions } from "../../test/committed-versions.ts";
import { nodeProfileEnvironment, webCryptoDigest } from "../../workspace-runs.ts";
import { workspaceGoogleRead } from "./google-read.ts";

const route = { app: "own", runsOn: "this-computer" } as const;
const address = "family@example.com";

const gmailSheet = `id: gmail
version: 0.1.0
kit: 1
provides: [connector]
hosts:
  - gmail.googleapis.com
secrets:
  google-account:
    purpose: Access to the Google account you connect.
    hosts: [gmail.googleapis.com]
    as: bearer
googleScopes:
  - scope: https://www.googleapis.com/auth/gmail.modify
    reason: Reads and sends your mail.
googleApis:
  - api: gmail.googleapis.com
    name: Gmail API
googleCheck:
  method: GET
  url: https://gmail.googleapis.com/gmail/v1/users/me/profile
tools: []
`;

let folder: string;
let acme: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-serve-google-"));
  acme = await realpath(folder).then((real) => join(real, "acme"));
  await mkdir(join(acme, "library", "connectors"), { recursive: true });
  await writeFile(join(acme, "workspace.yaml"), "id: acme\nname: Acme\n");
  await writeFile(
    join(acme, "library", "connectors", "mailbox.connector.yaml"),
    `name: Mailbox\ntransport:\n  google:\n    account: ${address}\n`,
  );
  await mkdir(join(acme, "integrations", "gmail"), { recursive: true });
  await writeFile(join(acme, "integrations", "gmail", "integration.yaml"), gmailSheet);
  await writeFile(
    join(acme, "library", "connectors", "bank.connector.yaml"),
    "name: Bank\ntransport:\n  http:\n    url: http://localhost:8700/mcp\n",
  );
});

afterEach(() => rm(folder, { recursive: true, force: true }));

/** This test starts a real git repository and commits twice (see `committedVersions`). */
const slowTest = { timeout: 60_000 };

const profile = () => ({
  platform: process.platform === "win32" ? ("windows" as const) : ("linux" as const),
  homeFolder: folder,
  variables: { HALONIC_HOME: join(folder, "profile") },
});

async function keyOf(workspace: string): Promise<string> {
  const folders = await workspaceFolders(
    profileFolder(profile() ?? nodeProfileEnvironment()),
    workspace,
    webCryptoDigest,
  );
  return folders.key;
}

/**
 * The server over the read ports, with the setups the test started.
 *
 * @param workspace reads the served version; the saved files as they were at the start when left out
 */
async function served(workspace?: () => Promise<LoadedWorkspace>) {
  const failures: unknown[] = [];
  const { setups } = openGoogleHost({ profile: profile() });
  const loaded = await loadWorkspace(new FolderDefinitionStore(acme, acme));
  const googleRead = workspaceGoogleRead({
    setups,
    workspaceKey: await keyOf(acme),
    root: acme,
    workspace: workspace ?? (async () => loaded),
  });
  const server = createServer({
    config: {
      deploymentId: "local",
      version: "0.0.0",
      minAppVersion: "0.0.0",
      allowedHosts: ["localhost"],
      maxBodyBytes: 1024,
    },
    ports: {
      googleRead,
      secrets: { get: async () => null },
      errorLog: { record: (cause: unknown) => failures.push(cause) },
      clock: { now: () => new Date("2026-11-16T12:00:00.000Z") },
    } as never,
  });
  const link = async (workspaceKey: string, id: string) =>
    (
      await setups.start({
        route,
        accountType: "personal",
        connector: { workspace: workspaceKey, id },
      })
    ).accountRef;
  const get = (path: string) =>
    server.handle(new Request(`http://localhost${path}`, { headers: { host: "localhost" } }), {
      clientAddress: "127.0.0.1",
    });
  return { link, get, key: await keyOf(acme), failures };
}

describe("serve: Google setups of the served workspace", () => {
  verifies("cli.commands.serve.google-read", () => {
    it("lists the setups linked to this workspace, with the connector's address in the steps", async () => {
      const { link, get, key, failures } = await served();
      const mine = await link(key, "mailbox");
      await link("0123456789abcdef0123456789abcdef", "mailbox");

      const response = await get("/api/google/setups");
      const body = (await response.json()) as {
        signIn: string;
        setups: { accountRef: string }[];
      };

      expect(failures).toEqual([]);
      expect(response.status).toBe(200);
      expect(body.signIn).toBe("here");
      expect(body.setups.map((setup) => setup.accountRef)).toEqual([mine]);
      expect(JSON.stringify(body)).toContain(address);
    });

    it("leaves out a setup whose connector is gone or isn't a Google one", async () => {
      const { link, get, key } = await served();
      const gone = await link(key, "nothing-here");
      const notGoogle = await link(key, "bank");

      const body = (await (await get("/api/google/setups")).json()) as { setups: unknown[] };

      expect(body.setups).toEqual([]);
      expect((await get(`/api/google/setups/${gone}`)).status).toBe(404);
      expect((await get(`/api/google/setups/${notGoogle}`)).status).toBe(404);
    });

    it("leaves out a setup whose Google connector has no integration to ask for", async () => {
      await rm(join(acme, "integrations"), { recursive: true });
      const { link, get, key, failures } = await served();
      await link(key, "mailbox");
      const body = (await (await get("/api/google/setups")).json()) as { setups: unknown[] };
      expect(failures).toEqual([]);
      expect(body.setups).toEqual([]);
    });

    it(
      "shows a connector's new address once the change is committed, before a run starts",
      slowTest,
      async () => {
        const { versions, commitAll } = await committedVersions(acme);
        try {
          const { link, get, key } = await served(() => versions.live());
          const mine = await link(key, "mailbox");
          const addressShown = async () =>
            JSON.stringify(await (await get("/api/google/setups")).json());
          expect(await addressShown()).toContain(address);

          await writeFile(
            join(acme, "library", "connectors", "mailbox.connector.yaml"),
            "name: Mailbox\ntransport:\n  google:\n    account: office@example.com\n",
          );
          // Saved but not committed: the live version still names the old address.
          expect(await addressShown()).toContain(address);
          await commitAll();

          expect(await addressShown()).toContain("office@example.com");
          expect((await get(`/api/google/setups/${mine}`)).status).toBe(200);
        } finally {
          await versions.close();
        }
      },
    );

    it("answers 404 for another workspace's setup", async () => {
      const { link, get } = await served();
      const other = await link("0123456789abcdef0123456789abcdef", "mailbox");
      expect((await get(`/api/google/setups/${other}`)).status).toBe(404);
    });

    it("has no way to start a sign-in or save a secret", async () => {
      const { link, get, key } = await served();
      const mine = await link(key, "mailbox");
      expect((await get(`/api/google/setups/${mine}/sign-in`)).status).toBe(404);
      expect((await get(`/api/google/setups/${mine}/secret`)).status).toBe(404);
    });
  });
});
