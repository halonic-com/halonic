import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Machine, SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type FramedHandshake, type HostIo, run } from "./host.ts";
import { messagingOnlyRoutes } from "./messaging-only.ts";
import { FakeKeychainShell } from "./secrets/fake-keychain-shell.test-helper.ts";
import type { HostRoute } from "./server/host-server.ts";
import { FrameKind } from "./stdio/frame-codec.ts";
import { TestRelay } from "./stdio/relay.test-helper.ts";

const relayPort = 50_124;

let scratch = "";
let profileFolder = "";
let workspace = "";

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "halonic-opened-workspaces-"));
  profileFolder = join(scratch, "profile");
  workspace = join(scratch, "acme");
  await mkdir(profileFolder);
  await mkdir(workspace);
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

/** A machine on which nothing really runs. */
function sandboxHere(): SrtSandbox {
  const machine: Partial<Machine> = { platform: "linux" };
  return new SrtSandbox(machine as Machine);
}

/** A host served over frames with `extra` arguments, its keychain answered by a fake shell. */
async function relayedHost(extra: readonly string[]) {
  const relay = new TestRelay(true);
  const shell = new FakeKeychainShell((frame) => relay.send(frame));
  relay.onHostFrame = (frame) => shell.take(frame);
  const errors: string[] = [];
  const io: HostIo = {
    input: relay.streams.input,
    write: () => {
      throw new Error("--stdio writes only through the output it took over.");
    },
    writeError: (text) => errors.push(text),
    takeOutput: () => relay.streams.output,
  };
  const args = [
    "--stdio",
    "--relay-host",
    `127.0.0.1:${relayPort}`,
    "--keychain-relay",
    "--profile-folder",
    profileFolder,
    ...extra,
  ];
  const running = run(args, "1.2.3", io, () => sandboxHere());
  const { token } = JSON.parse(await relay.handshakeLine()) as FramedHandshake;
  const headers = { host: `127.0.0.1:${relayPort}`, authorization: `Bearer ${token}` };
  const post = (path: string, body: unknown) =>
    relay.request(path, { method: "POST", headers, body: JSON.stringify(body) });
  /** Names `folder` and resolves once the host answered that it handled it, as the shell waits. */
  const name = async (folder: string) => {
    const answered = shell.noticed.length;
    relay.sendFrame(
      0,
      FrameKind.data,
      Buffer.from(JSON.stringify({ op: "open_workspace", folder })),
    );
    await eventually(() => shell.noticed.length > answered);
    expect(shell.noticed.at(-1)).toBe(folder);
  };
  const stop = async () => {
    relay.streams.input.end();
    return await running;
  };
  return { relay, errors, headers, post, name, stop };
}

/** Resolves once `check` holds, looking again after each turn of the event loop. */
async function eventually(check: () => boolean | Promise<boolean>): Promise<void> {
  while (!(await check())) await new Promise((resolve) => setImmediate(resolve));
}

verifies("agent-host.opened-workspaces", () => {
  describe("the shell names a folder opened after the host started", () => {
    it("serves the folder's connections once the shell names it, and not before", async () => {
      const host = await relayedHost([]);
      const connections = () => host.post("/v1/paperclip/connections", { workspace });

      const before = await connections();
      expect(before.status).toBe(404);
      expect(JSON.parse(before.body)).toMatchObject({ error: { kind: "unknown_workspace" } });

      await host.name(workspace);
      // Once the host has answered the notice, the very next request finds the folder.
      const after = await connections();
      expect(after.status).toBe(200);
      expect(JSON.parse(after.body)).toEqual({
        workspace: await realpath(workspace),
        connections: [],
      });
      expect(await host.stop()).toBe(0);
    });

    it("refuses a folder that doesn't exist and says why on standard error, without its path", async () => {
      const host = await relayedHost([]);
      const missing = join(scratch, "gone");
      await host.name(missing);
      expect(host.errors.join("")).toContain("doesn't exist");
      expect(host.errors.join("")).not.toContain(missing);
      expect((await host.post("/v1/paperclip/connections", { workspace: missing })).status).toBe(
        404,
      );
      expect(await host.stop()).toBe(0);
    });

    it("never takes the profile folder as a workspace", async () => {
      const host = await relayedHost([]);
      await host.name(profileFolder);
      expect(host.errors.join("")).toContain("profile folder");
      const answer = await host.post("/v1/paperclip/connections", { workspace: profileFolder });
      expect(answer.status).toBe(404);
      expect(await host.stop()).toBe(0);
    });
  });
});

verifies("agent-host.messaging-only", () => {
  describe("run --messaging-only", () => {
    it("serves health, the connections and the messaging, and answers 404 for runs, sessions and bridges", async () => {
      const host = await relayedHost(["--messaging-only", "--sweep-root", workspace]);
      const health = await host.relay.request("/v1/health", { headers: host.headers });
      expect(JSON.parse(health.body)).toEqual({ ok: true, version: "1.2.3" });
      expect((await host.post("/v1/paperclip/connections", { workspace })).status).toBe(200);

      const refused = [
        await host.post("/v1/harnesses/runs/start", { workspace }),
        await host.post("/v1/sandbox/sessions/open", {}),
        await host.post("/v1/sandbox/this-computer/open", {}),
        await host.post("/v1/bridge/open", {}),
        await host.relay.request("/v1/harnesses", { headers: host.headers }),
      ];
      for (const answer of refused) {
        expect(answer.status).toBe(404);
        expect(JSON.parse(answer.body)).toMatchObject({ error: { kind: "not_found" } });
      }
      expect(await host.stop()).toBe(0);
    });

    it("names opened folders to it too", async () => {
      const host = await relayedHost(["--messaging-only"]);
      await host.name(workspace);
      expect((await host.post("/v1/paperclip/connections", { workspace })).status).toBe(200);
      expect(await host.stop()).toBe(0);
    });

    it("leaves out a messaging route under any other path", () => {
      const route = (path: string): HostRoute => ({ method: "POST", path, handle: () => {} });
      const served = messagingOnlyRoutes("1.2.3", [
        route("/v1/messaging/read"),
        route("/v1/paperclip/key"),
        route("/v1/harnesses/runs/start"),
      ]);
      expect(served.map((each) => each.path)).toEqual([
        "/v1/health",
        "/v1/messaging/read",
        "/v1/paperclip/key",
      ]);
    });
  });
});
