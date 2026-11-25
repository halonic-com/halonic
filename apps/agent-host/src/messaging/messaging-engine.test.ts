import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CachedAgentMessaging } from "@halonicjs/adapter-agent-messaging-cache";
import { ManualClock, MemoryScheduler } from "@halonicjs/adapter-memory";
import { serverPairingSecretName } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { HostKeyStore } from "../paperclip/host-key-store.ts";
import { PaperclipSignIn } from "../paperclip/paperclip-sign-in.ts";
import { paperclipSignInRoutes } from "../paperclip/paperclip-sign-in-routes.ts";
import { FakeSignInCalls } from "../paperclip/sign-in-calls.test-helper.ts";
import { startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import {
  readConnectionFile,
  removeConnectionFile,
  writeConnectionFile,
} from "./connection-file.ts";
import { acme, type Desktop, startDesktop, testKey } from "./desktop-messaging.test-helper.ts";
import { messagingEngineFileName } from "./messaging-engine-setting.ts";

let desktop: Desktop | undefined;

afterEach(async () => {
  await desktop?.close();
  desktop = undefined;
});

/** Sets the workspace's engine to the fake server, with its device token in the keychain. */
async function pairWithServer(on: Desktop): Promise<void> {
  const { key } = await on.setting.read(on.workspace);
  await on.keychain.set(serverPairingSecretName(key), on.server.token);
  await on.setting.useServer(on.workspace, on.server.address);
}

/** The setting's file in the workspace's folder of the profile. */
async function settingFile(on: Desktop): Promise<string> {
  const { key } = await on.setting.read(on.workspace);
  return join(on.profile, "workspaces", key, messagingEngineFileName);
}

const handOver = (on: Desktop) =>
  on.paperclipKey.handOver({
    workspace: on.workspace,
    connection: "halonic",
    key: testKey,
    ...acme,
  });

verifies("agent-host.messaging-engine", () => {
  describe("the hub's provider follows the setting", () => {
    it("joins the server in place of Paperclip, behind the same cache and routes", async () => {
      desktop = await startDesktop();
      const on = desktop;
      await handOver(on);
      expect((await on.studio.listSources()).map((source) => source.id)).toEqual([
        "paperclip:halonic",
      ]);
      const before = await on.messaging.of(on.workspace);

      await pairWithServer(on);
      await on.messaging.switchEngine(on.workspace);

      const after = await on.messaging.of(on.workspace);
      expect(after).toBe(before);
      expect(after?.messaging).toBeInstanceOf(CachedAgentMessaging);
      expect(after?.engine).toEqual({ kind: "server", address: on.server.address });
      expect((await on.studio.listSources()).map((source) => source.id)).toEqual([
        "halonic-server:acme",
      ]);
      expect((await on.studio.listAgents()).map((agent) => agent.name)).toEqual(["Cy"]);
      expect(
        on.server.seen.every((seen) => seen.authorization === `Bearer ${on.server.token}`),
      ).toBe(true);
      expect(on.answers.join("\n")).not.toContain(on.server.token);
    });

    it("joins Paperclip again, with the key it kept, when it is This computer again", async () => {
      desktop = await startDesktop();
      const on = desktop;
      await handOver(on);
      await pairWithServer(on);
      await on.messaging.switchEngine(on.workspace);

      await on.setting.useThisComputer(on.workspace);
      await on.messaging.switchEngine(on.workspace);

      expect((await on.messaging.of(on.workspace))?.engine).toEqual({ kind: "this-computer" });
      expect((await on.studio.listSources()).map((source) => source.id)).toEqual([
        "paperclip:halonic",
      ]);
    });

    it("opens a workspace set to a server on that server, calling no Paperclip", async () => {
      desktop = await startDesktop();
      const on = desktop;
      await pairWithServer(on);
      expect((await on.studio.listSources()).map((source) => source.id)).toEqual([
        "halonic-server:acme",
      ]);
      expect(on.paperclip.seen).toEqual([]);
    });

    it("joins nothing without a device token, and still refuses Paperclip", async () => {
      desktop = await startDesktop();
      const on = desktop;
      await on.setting.useServer(on.workspace, on.server.address);
      expect(await on.studio.listSources()).toEqual([]);
      expect(on.server.seen).toEqual([]);
      expect(await on.messaging.usesServer(on.workspace)).toBe(true);
    });
  });

  describe("the setting lives in the profile", () => {
    it("keeps the engine and its address when a pull rewrites the connection file", async () => {
      desktop = await startDesktop();
      const on = desktop;
      await pairWithServer(on);
      await on.messaging.of(on.workspace);

      await on.writeConnection("https://paperclip.elsewhere.test", "other-company");
      await writeFile(
        join(on.workspace, messagingEngineFileName),
        JSON.stringify({ version: 1, engine: "server", address: "https://evil.example" }),
      );

      expect((await on.setting.read(on.workspace)).engine).toEqual({
        kind: "server",
        address: on.server.address,
      });
      await on.messaging.switchEngine(on.workspace);
      expect((await on.messaging.of(on.workspace))?.engine).toEqual({
        kind: "server",
        address: on.server.address,
      });
    });

    it("writes the file with mode 0600, no token and no temporary file left", async () => {
      desktop = await startDesktop();
      const on = desktop;
      await pairWithServer(on);
      const file = await settingFile(on);
      const files = await on.filesIn(join(file, ".."));
      expect([...files.keys()]).toEqual([file]);
      expect(JSON.parse(files.get(file) ?? "")).toEqual({
        version: 1,
        engine: "server",
        address: on.server.address,
      });
      expect(files.get(file)).not.toContain(on.server.token);
      if (process.platform !== "win32") expect((await stat(file)).mode & 0o777).toBe(0o600);
    });

    it("refuses to save an address that breaks the rule, and writes nothing", async () => {
      desktop = await startDesktop();
      const on = desktop;
      await expect(
        on.setting.useServer(on.workspace, "http://halonic.acme.test"),
      ).rejects.toMatchObject({ reason: "unsafe-address" });
      const { key } = await on.setting.read(on.workspace);
      expect(await readdir(join(on.profile, "workspaces", key)).catch(() => [])).toEqual([]);
    });
  });

  describe("a setting it can't use is This computer, with one warning", () => {
    const cases: [string, string | undefined][] = [
      ["isn't JSON", "{ version: 1"],
      [
        "a newer Halonic wrote",
        JSON.stringify({ version: 2, engine: "server", address: "https://halonic.acme.test" }),
      ],
      [
        "has plain http to another computer",
        JSON.stringify({ version: 1, engine: "server", address: "http://halonic.acme.test" }),
      ],
      [
        "has a field it doesn't know",
        JSON.stringify({
          version: 1,
          engine: "server",
          address: "https://halonic.acme.test",
          token: "x",
        }),
      ],
      ["is a folder, which can't be read", undefined],
    ];
    for (const [what, text] of cases) {
      it(`reads a file that ${what}`, async () => {
        desktop = await startDesktop();
        const on = desktop;
        const file = await settingFile(on);
        await mkdir(join(file, ".."), { recursive: true });
        if (text === undefined) await mkdir(file);
        else await writeFile(file, text);

        expect((await on.messaging.of(on.workspace))?.engine).toEqual({ kind: "this-computer" });
        const warnings = on.logged.filter((line) => line.includes("messaging engine setting"));
        expect(warnings).toHaveLength(1);
        expect(on.server.seen).toEqual([]);
      });
    }

    it("says nothing when there is no file", async () => {
      desktop = await startDesktop();
      const on = desktop;
      expect((await on.messaging.of(on.workspace))?.engine).toEqual({ kind: "this-computer" });
      expect(on.logged).toEqual([]);
    });
  });

  describe("Connect and Disconnect of local Paperclip while the engine is a server", () => {
    it("answer 409 server_engine and keep no key", async () => {
      desktop = await startDesktop();
      const on = desktop;
      await pairWithServer(on);
      const key = await on.transport.request("POST /v1/paperclip/key", {
        workspace: on.workspace,
        connection: "halonic",
        key: testKey,
        ...acme,
      });
      expect(key.status).toBe(409);
      expect(key.body).toMatchObject({ error: { kind: "server_engine" } });
      expect(on.keys.madeFor({ workspace: on.workspace, connection: "halonic" })).toBeUndefined();

      const disconnect = await on.transport.request("POST /v1/paperclip/disconnect", {
        workspace: on.workspace,
        connection: "halonic",
      });
      expect(disconnect.status).toBe(409);
      expect(disconnect.body).toMatchObject({ error: { kind: "server_engine" } });
      expect(on.paperclip.seen).toEqual([]);
    });

    it("refuse a Paperclip sign-in with 409 server_engine before it starts", async () => {
      desktop = await startDesktop();
      const on = desktop;
      await pairWithServer(on);
      const calls = new FakeSignInCalls();
      const clock = new ManualClock();
      const signIn = new PaperclipSignIn({
        callsFor: () => calls,
        keyStore: new HostKeyStore({
          keep: () => undefined,
          connect: async () => undefined,
          readConnection: readConnectionFile,
          writeConnection: writeConnectionFile,
          forget: async () => undefined,
          removeConnection: removeConnectionFile,
        }),
        scheduler: new MemoryScheduler({ onTimer: async () => {}, onTick: async () => {} }, clock),
        clock,
      });
      const token = randomLaunchToken();
      const host = await startHostServer(
        token,
        paperclipSignInRoutes({
          signIn,
          workspaceRoots: [on.workspace],
          log: () => undefined,
          usesServer: (folder) => on.messaging.usesServer(folder),
        }),
      );
      try {
        const answer = await fetch(`${host.url}/v1/paperclip/sign-in/start`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ workspace: on.workspace, address: acme.address }),
        });
        expect(answer.status).toBe(409);
        expect(await answer.json()).toMatchObject({ error: { kind: "server_engine" } });
        expect(calls.sent).toEqual([]);
      } finally {
        await host.close();
      }
    });
  });
});
