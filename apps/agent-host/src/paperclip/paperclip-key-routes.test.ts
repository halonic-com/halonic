import { mkdtemp, readdir, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type PaperclipBinding, PaperclipKeys } from "@halonicjs/host-agent-messaging-hub";
import type { DefinitionSource } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { readPaperclipConnections } from "@halonicjs/workspace";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { paperclipKeyRoutes } from "./paperclip-key-routes.ts";

// A fake key only these tests use, so its absence from answers and logs means something.
const fakeKey = "pcp_board_fake-key-for-tests-only";
const acme = { address: "https://paperclip.acme.test", company: "acme-company" };
const token = randomLaunchToken();

interface Setup {
  url: string;
  keys: PaperclipKeys;
  /** The workspace the launcher named, by its real path. */
  workspace: string;
  /** Every binding the route said it kept. */
  kept: PaperclipBinding[];
  /** Every line the host's log got: the fake logger. */
  logged: string[];
  close(): Promise<void>;
}

let setup: Setup | undefined;
// The host's own calls go through the real fetch; only the ones a guard lets out go through this.
const paperclipFetch = vi.fn(async (_url: string, _init: RequestInit) => new Response("{}"));

afterEach(async () => {
  await setup?.close();
  setup = undefined;
  paperclipFetch.mockClear();
});

/** Starts the route; `startProvider` stands in for the host starting the connection's provider. */
async function started(startProvider = async (_binding: PaperclipBinding) => {}): Promise<Setup> {
  const keys = new PaperclipKeys();
  const logged: string[] = [];
  const kept: PaperclipBinding[] = [];
  const workspace = await realpath(await mkdtemp(join(tmpdir(), "acme-paperclip-")));
  const server: HostServer = await startHostServer(
    token,
    paperclipKeyRoutes({
      keys,
      workspaceRoots: [workspace],
      kept: async (binding) => {
        kept.push(binding);
        await startProvider(binding);
      },
      log: (text) => logged.push(text),
      // Every workspace here may start a run; `paperclip-key-may-start.test.ts` covers one that may not.
      mayStart: async () => true,
    }),
  );
  const close = async () => {
    await server.close();
    await rm(workspace, { recursive: true, force: true });
  };
  setup = { url: server.url, keys, workspace, kept, logged, close };
  return setup;
}

/** The set-up workspace's `halonic` connection. */
function halonic(): PaperclipBinding {
  return { workspace: setup?.workspace ?? "", connection: "halonic" };
}

/**
 * Hands over `body` for the set-up workspace (unless it names one), with the
 * page's `Sec-Fetch-Site` when one is given.
 */
function handOver(url: string, fields: object, site?: string): Promise<Response> {
  const body = { workspace: setup?.workspace, ...fields };
  return fetch(`${url}/v1/paperclip/key`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(site === undefined ? {} : { "sec-fetch-site": site }),
    },
    body: JSON.stringify(body),
  });
}

/** What the provider does for one request: the guard, then a fetch to the origin the key was made for. */
function guardedRead(keys: PaperclipKeys, now: { address: string; company: string }) {
  return keys.callWith(halonic(), now, ({ key, origin }) =>
    paperclipFetch(`${origin}/api/agents/me`, { headers: { authorization: `Bearer ${key}` } }),
  );
}

/** A workspace in memory that holds `connections/paperclip/halonic.yaml`. */
function workspaceWithConnection(address: string): DefinitionSource {
  const files: Record<string, string> = {
    "workspace.yaml": "id: acme\nname: Acme\n",
    "connections/paperclip/halonic.yaml": `label: Halonic\naddress: ${address}\ncompany: ${acme.company}\n`,
  };
  return {
    location: "memory:acme",
    list: async (dir) => Object.keys(files).filter((path) => path.startsWith(`${dir ?? ""}/`)),
    read: async (path) => files[path] ?? null,
    version: async () => "1",
  };
}

verifies("agent-host.paperclip-key-hand-over", () => {
  describe("the hand-over route", () => {
    it("keeps the key, answers no key and calls nobody", async () => {
      const { url, keys } = await started();
      const kept = await handOver(url, { connection: "halonic", key: fakeKey, ...acme });
      const text = await kept.text();
      expect(kept.status).toBe(200);
      expect(JSON.parse(text)).toEqual({ kept: true });
      expect(text).not.toContain(fakeKey);
      expect(keys.has(halonic())).toBe(true);
      expect(setup?.kept).toEqual([halonic()]);
      expect(paperclipFetch).not.toHaveBeenCalled();
    });

    it("keeps no key for a folder the launcher didn't name", async () => {
      const { url, keys, kept } = await started();
      const refused = await handOver(url, {
        workspace: tmpdir(),
        connection: "halonic",
        key: fakeKey,
        ...acme,
      });
      expect(refused.status).toBe(404);
      expect(await refused.text()).toContain("unknown_workspace");
      expect(keys.has({ workspace: tmpdir(), connection: "halonic" })).toBe(false);
      expect(kept).toEqual([]);
    });

    it("refuses a page of another site before it reads the body", async () => {
      const { url, keys } = await started();
      const refused = await handOver(
        url,
        { connection: "halonic", key: fakeKey, ...acme },
        "cross-site",
      );
      expect(refused.status).toBe(403);
      expect(await refused.text()).toContain("secret_from_other_site");
      expect(keys.has(halonic())).toBe(false);
    });

    it("refuses a body that doesn't fit with no detail, so the answer can't repeat the key", async () => {
      const { url, keys } = await started();
      const bodies = [
        { connection: "../halonic", key: fakeKey, ...acme },
        { connection: "halonic", key: `${fakeKey}\nx`, ...acme },
        { connection: "halonic", key: fakeKey, ...acme, extra: fakeKey },
        { connection: "halonic", key: fakeKey, ...acme, address: "ftp://paperclip.acme.test" },
        { connection: "halonic", key: fakeKey, ...acme, address: "http://paperclip.acme.test" },
      ];
      for (const body of bodies) {
        const refused = await handOver(url, body);
        const text = await refused.text();
        expect(refused.status).toBe(400);
        expect(text).toContain("body_invalid");
        expect(text).not.toContain(fakeKey);
      }
      expect(keys.has(halonic())).toBe(false);
    });

    it("forgets the key and refuses when the connection's provider doesn't start", async () => {
      const { url, keys, logged } = await started(async () => {
        throw new TypeError(`no provider for ${fakeKey}`);
      });
      const refused = await handOver(url, { connection: "halonic", key: fakeKey, ...acme });
      const text = await refused.text();

      expect(refused.status).toBe(502);
      expect(text).toContain("provider_not_started");
      expect(text).not.toContain(fakeKey);
      expect(keys.has(halonic())).toBe(false);
      expect(logged.join("")).toContain("TypeError");
      expect(logged.join("")).not.toContain(fakeKey);
    });

    it("never writes the key to its log, whatever it is handed", async () => {
      const { url, logged } = await started();
      await handOver(url, { connection: "halonic", key: fakeKey, ...acme });
      await handOver(url, { connection: "halonic", key: fakeKey, ...acme, address: "ftp://x" });
      await handOver(url, { connection: "halonic", key: fakeKey, ...acme }, "cross-site");
      expect(logged.join("")).not.toContain(fakeKey);
    });
  });

  describe("a workspace and its connection file", () => {
    it("makes no request when a workspace with a connection file opens and nobody connects", async () => {
      const { keys } = await started();
      const { connections } = await readPaperclipConnections(workspaceWithConnection(acme.address));
      for (const { connection } of connections) {
        expect(await guardedRead(keys, connection)).toEqual({
          kind: "failed",
          failure: "signed-out",
        });
      }
      expect(connections).toHaveLength(1);
      expect(paperclipFetch).not.toHaveBeenCalled();
    });

    it("sends the key only to the file's address once connected, and nothing after it changes to https://evil.test", async () => {
      const { url, keys } = await started();
      await handOver(url, { connection: "halonic", key: fakeKey, ...acme });
      const before = await readPaperclipConnections(workspaceWithConnection(acme.address));
      await guardedRead(keys, before.connections[0]?.connection ?? acme);
      expect(paperclipFetch).toHaveBeenCalledTimes(1);
      expect(paperclipFetch).toHaveBeenCalledWith("https://paperclip.acme.test/api/agents/me", {
        headers: { authorization: `Bearer ${fakeKey}` },
      });

      const pulled = await readPaperclipConnections(workspaceWithConnection("https://evil.test"));
      const answer = await guardedRead(keys, pulled.connections[0]?.connection ?? acme);
      expect(answer).toEqual({ kind: "failed", failure: "signed-out" });
      expect(paperclipFetch).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps the key in memory only: nothing in the host's Paperclip code writes a file", async () => {
    const folder = new URL("./", import.meta.url);
    const sources = (await readdir(folder)).filter(
      (name) => name.endsWith(".ts") && !name.includes(".test"),
    );
    for (const name of sources) {
      expect(await readFile(new URL(name, folder), "utf8")).not.toMatch(/node:fs|node:child/u);
    }
    expect(sources.length).toBeGreaterThan(0);
  });
});
