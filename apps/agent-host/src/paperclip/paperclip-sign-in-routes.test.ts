import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ManualClock, MemoryScheduler } from "@halonicjs/adapter-memory";
import { parsePaperclipConnection } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import {
  readConnectionFile,
  removeConnectionFile,
  writeConnectionFile,
} from "../messaging/connection-file.ts";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { HostKeyStore } from "./host-key-store.ts";
import { PaperclipSignIn } from "./paperclip-sign-in.ts";
import { paperclipSignInRoutes } from "./paperclip-sign-in-routes.ts";
import { FakeSignInCalls, fakeBoardKey } from "./sign-in-calls.test-helper.ts";
import type { StoredPaperclipKey } from "./sign-in-calls.ts";

const token = randomLaunchToken();
const address = "https://paperclip.acme.test";

interface Setup {
  url: string;
  workspace: string;
  calls: FakeSignInCalls;
  kept: StoredPaperclipKey[];
  connected: string[];
  forgot: string[];
  logged: string[];
  close(): Promise<void>;
}

let setup: Setup | undefined;

afterEach(async () => {
  await setup?.close();
  setup = undefined;
});

async function started(): Promise<Setup> {
  const workspace = await realpath(await mkdtemp(join(tmpdir(), "acme-sign-in-")));
  const calls = new FakeSignInCalls();
  const clock = new ManualClock();
  const kept: StoredPaperclipKey[] = [];
  const connected: string[] = [];
  const forgot: string[] = [];
  const logged: string[] = [];
  let signIn: PaperclipSignIn | undefined;
  const scheduler = new MemoryScheduler(
    { onTimer: async (timer) => signIn?.onTimer(timer), onTick: async () => undefined },
    clock,
  );
  signIn = new PaperclipSignIn({
    callsFor: () => calls,
    keyStore: new HostKeyStore({
      keep: (entry) => void kept.push(entry),
      connect: async (_workspace, name) => void connected.push(name),
      readConnection: readConnectionFile,
      writeConnection: writeConnectionFile,
      forget: async (_workspace, name) => void forgot.push(name),
      removeConnection: removeConnectionFile,
    }),
    scheduler,
    clock,
  });
  const server: HostServer = await startHostServer(
    token,
    paperclipSignInRoutes({
      signIn,
      workspaceRoots: [workspace],
      log: (text) => logged.push(text),
    }),
  );
  const close = async () => {
    await server.close();
    await rm(workspace, { recursive: true, force: true });
  };
  setup = { url: server.url, workspace, calls, kept, connected, forgot, logged, close };
  return setup;
}

async function post(path: string, body: object, site?: string): Promise<Response> {
  return fetch(`${setup?.url}/v1/paperclip/sign-in/${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(site === undefined ? {} : { "sec-fetch-site": site }),
    },
    body: JSON.stringify(body),
  });
}

async function startAt(fields: object): Promise<Record<string, unknown>> {
  const answer = await post("start", { workspace: setup?.workspace, ...fields });
  expect(answer.status).toBe(200);
  return (await answer.json()) as Record<string, unknown>;
}

async function connectionFile(workspace: string, name: string, text: string): Promise<void> {
  await mkdir(join(workspace, "connections/paperclip"), { recursive: true });
  await writeFile(join(workspace, "connections/paperclip", `${name}.yaml`), text);
}

verifies("agent-host.paperclip-sign-in", () => {
  describe("the sign-in routes", () => {
    it("start a new connection with no company and answer no key", async () => {
      const { calls } = await started();
      const answer = await startAt({ address });
      expect(answer).toMatchObject({ outcome: "started", phrase: calls.challenges[0]?.command });
      expect(calls.challenges[0]?.requestedCompanyId).toBeUndefined();
      expect(JSON.stringify(answer)).not.toContain(fakeBoardKey);
    });

    it("hand the key over once, write the new connection's file and keep the key", async () => {
      const { calls, workspace, kept, connected } = await started();
      const { signInId } = await startAt({ address });
      calls.statuses = ["approved"];
      const first = await post("poll", { signInId });
      expect(first.headers.get("cache-control")).toBe("no-store");
      expect(await first.json()).toEqual({
        status: "connected",
        connection: "acme",
        address,
        company: "acme",
        workspace,
        key: fakeBoardKey,
      });
      expect(await (await post("poll", { signInId })).json()).toEqual({ status: "unknown" });
      const text = await readFile(join(workspace, "connections/paperclip/acme.yaml"), "utf8");
      expect(text).not.toContain(fakeBoardKey);
      const parsed = parsePaperclipConnection(text);
      expect(parsed.ok && parsed.value.value).toEqual({ label: "Acme", address, company: "acme" });
      expect(kept).toEqual([
        { address, companyId: "acme", key: fakeBoardKey, workspace, name: "acme" },
      ]);
      expect(connected).toEqual(["acme"]);
    });

    it("sign in for the file that has the same address, with its company", async () => {
      const { calls, workspace } = await started();
      await connectionFile(
        workspace,
        "halonic",
        `label: Halonic\naddress: ${address}/\ncompany: acme\n`,
      );
      await startAt({ address });
      expect(calls.challenges[0]?.requestedCompanyId).toBe("acme");
      calls.statuses = ["approved"];
      const signInId = (await startAt({ address, connection: "halonic" }))["signInId"];
      expect(await (await post("poll", { signInId })).json()).toMatchObject({
        status: "connected",
        connection: "halonic",
      });
    });

    it("refuse plain http to another computer, and a named file with another address", async () => {
      const { calls, workspace } = await started();
      await connectionFile(
        workspace,
        "globex",
        "label: Globex\naddress: https://paperclip.globex.test\ncompany: globex\n",
      );
      const refused = { outcome: "refused", reason: "address-not-allowed" };
      expect(await startAt({ address: "http://paperclip.acme.test" })).toEqual(refused);
      expect(await startAt({ address, connection: "globex" })).toEqual(refused);
      expect(calls.challenges).toEqual([]);
    });

    it("say unreachable when no sign-in starts, and log no key", async () => {
      const { calls, logged } = await started();
      calls.createChallenge = async () => {
        throw new TypeError("fetch failed");
      };
      expect(await startAt({ address })).toEqual({ outcome: "refused", reason: "unreachable" });
      expect(logged.join("")).toContain("TypeError");
      expect(logged.join("")).not.toContain(fakeBoardKey);
    });

    it("cancel a sign-in", async () => {
      const { calls } = await started();
      const { signInId } = await startAt({ address });
      expect(await (await post("cancel", { signInId })).json()).toEqual({ status: "cancelled" });
      expect(calls.cancelled).toHaveLength(1);
    });

    it("confirm a key Studio kept, so the host keeps it and the file", async () => {
      const { calls, workspace } = await started();
      const { signInId } = await startAt({ address });
      calls.statuses = ["approved"];
      await post("poll", { signInId });
      expect(await (await post("confirm", { signInId })).json()).toEqual({ confirmed: true });
      expect(await (await post("cancel", { signInId })).json()).toEqual({ status: "unknown" });
      expect(await readConnectionFile(workspace, "acme")).toBeDefined();
      expect(calls.revoked).toEqual([]);
    });

    it("remove the new connection's file when Studio couldn't keep the key", async () => {
      const { calls, workspace, forgot } = await started();
      const { signInId } = await startAt({ address });
      calls.statuses = ["approved"];
      await post("poll", { signInId });
      expect(await (await post("cancel", { signInId })).json()).toEqual({ status: "cancelled" });
      expect(await readdir(join(workspace, "connections/paperclip"))).toEqual([]);
      expect(forgot).toEqual(["acme"]);
      expect(calls.revoked).toEqual([fakeBoardKey]);
      expect(await (await post("confirm", { signInId })).json()).toEqual({ confirmed: false });
    });

    it("keep an existing connection's file when Studio couldn't keep the key", async () => {
      const { calls, workspace, forgot } = await started();
      await connectionFile(
        workspace,
        "acme",
        `label: Acme
address: ${address}
company: acme
`,
      );
      const { signInId } = await startAt({ address });
      calls.statuses = ["approved"];
      await post("poll", { signInId });
      await post("cancel", { signInId });
      expect(await readConnectionFile(workspace, "acme")).toBeDefined();
      expect(forgot).toEqual(["acme"]);
    });

    it("refuse a request from another site before reading it", async () => {
      await started();
      const answer = await post("start", { workspace: setup?.workspace, address }, "cross-site");
      expect(answer.status).toBe(403);
    });

    it("refuse a workspace the launcher didn't name", async () => {
      await started();
      const answer = await post("start", { workspace: tmpdir(), address });
      expect(answer.status).toBe(404);
    });
  });
});

verifies("agent-host.paperclip-add-account", () => {
  describe("the sign-in routes with newConnection", () => {
    const halonic = `label: Halonic\naddress: ${address}\ncompany: acme\n`;

    it("write a second connection file and leave the first connection's file and key alone", async () => {
      const { calls, workspace, kept, connected, forgot } = await started();
      await connectionFile(workspace, "acme", halonic);
      const answer = await startAt({ address, newConnection: true });
      expect(calls.challenges[0]?.requestedCompanyId).toBe("acme");
      calls.statuses = ["approved"];
      expect(await (await post("poll", { signInId: answer["signInId"] })).json()).toMatchObject({
        status: "connected",
        connection: "acme-2",
      });
      expect(await readConnectionFile(workspace, "acme")).toEqual({
        label: "Halonic",
        address,
        company: "acme",
      });
      expect(await readConnectionFile(workspace, "acme-2")).toEqual({
        label: "Acme",
        address,
        company: "acme",
      });
      expect(kept).toEqual([
        { address, companyId: "acme", key: fakeBoardKey, workspace, name: "acme-2" },
      ]);
      expect(connected).toEqual(["acme-2"]);
      expect(forgot).toEqual([]);
    });

    it("remove only the second file when Studio couldn't keep its key", async () => {
      const { calls, workspace, forgot } = await started();
      await connectionFile(workspace, "acme", halonic);
      const { signInId } = await startAt({ address, newConnection: true });
      calls.statuses = ["approved"];
      await post("poll", { signInId });
      await post("cancel", { signInId });
      expect(await readdir(join(workspace, "connections/paperclip"))).toEqual(["acme.yaml"]);
      expect(forgot).toEqual(["acme-2"]);
    });

    it("refuse a new connection that names a file", async () => {
      const { calls, workspace } = await started();
      await connectionFile(workspace, "acme", halonic);
      expect(await startAt({ address, connection: "acme", newConnection: true })).toEqual({
        outcome: "refused",
        reason: "address-not-allowed",
      });
      expect(calls.challenges).toEqual([]);
    });
  });
});
