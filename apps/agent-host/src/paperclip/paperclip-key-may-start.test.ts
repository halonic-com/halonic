import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type PaperclipBinding, PaperclipKeys } from "@halonicjs/host-agent-messaging-hub";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { paperclipKeyRoutes } from "./paperclip-key-routes.ts";
import type { WorkspaceMayStart } from "./workspace-may-start.ts";

// A fake key only these tests use.
const fakeKey = "pcp_board_fake-key-for-tests-only";
const acme = { address: "https://paperclip.acme.test", company: "acme-company" };
const token = randomLaunchToken();

interface Setup {
  url: string;
  keys: PaperclipKeys;
  workspace: string;
  /** Every binding the route said it kept. */
  kept: PaperclipBinding[];
  /** Every workspace the run gate was asked about. */
  asked: string[];
}

let close: (() => Promise<void>) | undefined;

afterEach(async () => {
  await close?.();
  close = undefined;
});

/** Starts the hand-over route with `mayStart` as its run gate, or none when it is `undefined`. */
async function started(mayStart: WorkspaceMayStart | undefined): Promise<Setup> {
  const keys = new PaperclipKeys();
  const kept: PaperclipBinding[] = [];
  const asked: string[] = [];
  const workspace = await realpath(await mkdtemp(join(tmpdir(), "acme-may-start-key-")));
  const server: HostServer = await startHostServer(
    token,
    paperclipKeyRoutes({
      keys,
      workspaceRoots: [workspace],
      kept: async (binding) => {
        kept.push(binding);
      },
      log: () => undefined,
      ...(mayStart === undefined
        ? {}
        : {
            mayStart: (folder: string) => {
              asked.push(folder);
              return mayStart(folder);
            },
          }),
    }),
  );
  close = async () => {
    await server.close();
    await rm(workspace, { recursive: true, force: true });
  };
  return { url: server.url, keys, workspace, kept, asked };
}

function handOver(setup: Setup): Promise<Response> {
  return fetch(`${setup.url}/v1/paperclip/key`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      workspace: setup.workspace,
      connection: "halonic",
      key: fakeKey,
      ...acme,
    }),
  });
}

/** Hands a key over and checks the host refused it with `may_not_start` and kept nothing. */
async function expectRefused(setup: Setup): Promise<void> {
  const refused = await handOver(setup);
  const text = await refused.text();
  expect(refused.status).toBe(403);
  expect(JSON.parse(text)).toMatchObject({ error: { kind: "may_not_start" } });
  expect(text).not.toContain(fakeKey);
  expect(setup.keys.has({ workspace: setup.workspace, connection: "halonic" })).toBe(false);
  expect(setup.kept).toEqual([]);
}

verifies("agent-host.paperclip-key-hand-over", () => {
  it("keeps nothing for a workspace that may not start a run", async () => {
    const setup = await started(async () => false);
    await expectRefused(setup);
    expect(setup.asked).toEqual([setup.workspace]);
  });

  it("keeps nothing when the run gate fails", async () => {
    await expectRefused(await started(() => Promise.reject(new Error("unreadable"))));
  });

  it("keeps nothing when the host has no run gate", async () => {
    await expectRefused(await started(undefined));
  });

  it("keeps the key for a workspace that may start a run", async () => {
    const setup = await started(async () => true);
    const kept = await handOver(setup);
    expect(kept.status).toBe(200);
    expect(await kept.json()).toEqual({ kept: true });
    const binding = { workspace: setup.workspace, connection: "halonic" };
    expect(setup.keys.has(binding)).toBe(true);
    expect(setup.kept).toEqual([binding]);
  });
});
