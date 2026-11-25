import { mkdir, mkdtemp, readdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemorySecrets } from "@halonicjs/adapter-memory";
import { findRequest } from "@halonicjs/adapter-paperclip-client";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  acme,
  canaryKey,
  FakePaperclip,
  storedRecord,
  writeConnection,
} from "../../test/fake-paperclip.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { openServeMessaging, type ServeMessaging } from "./serve-messaging.ts";

let folder: string;
let workspace: string;
let cacheFolder: string;
let paperclip: FakePaperclip;
let logged: string[];

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "serve-messaging-"));
  workspace = join(folder, "engine-workspace");
  cacheFolder = join(folder, "profile", "agent-messaging-cache");
  await writeConnection(workspace, "halonic", { label: "Halonic", ...acme });
  paperclip = new FakePaperclip();
  logged = [];
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await removeTestFolder(folder);
});

/** The server's messaging over `stored`, the serve profile's secrets, at 14:00 UTC. */
function opened(stored: Record<string, string> = storedRecord("halonic")): Promise<ServeMessaging> {
  return openServeMessaging({
    workspace,
    keys: new MemorySecrets(stored),
    cacheFolder,
    report: (failure) => logged.push(String(failure.error)),
    warn: (message) => logged.push(message),
    fetch: paperclip.fetch,
    now: () => new Date("2026-11-24T14:00:00.000Z"),
  });
}

async function filesUnder(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

verifies("server.paperclip-key-store", () => {
  it("reads with the stored key, only at the address it was made for", async () => {
    const { messaging, connected } = await opened();

    const agents = await messaging.listAgents();

    expect(connected).toEqual(["paperclip:halonic"]);
    expect(agents.map((agent) => agent.name)).toEqual(["Ada", "Bo"]);
    expect(paperclip.seen).toEqual([
      {
        url: `${acme.address}/api/companies/${acme.company}/agents`,
        method: "GET",
        authorization: `Bearer ${canaryKey}`,
      },
    ]);
  });

  it("sends nothing that isn't on the provider's fixed request list", async () => {
    const { messaging } = await opened();

    await messaging.listAgents();
    const [chat] = await messaging.listConversations();
    await messaging.listMessages(chat?.id ?? "");
    await messaging.listInboxItems();
    await messaging.listWork();
    await messaging.search("ship");

    expect(paperclip.seen.length).toBeGreaterThan(4);
    for (const seen of paperclip.seen) {
      const { origin, pathname } = new URL(seen.url);
      expect(origin).toBe(acme.address);
      expect(findRequest(seen.method, pathname), `${seen.method} ${pathname}`).toBeDefined();
    }
  });

  describe("a connection file that changed after the key was stored", () => {
    it("makes no call once its address is https://evil.test, and the source is signed out", async () => {
      const { messaging } = await opened();
      await writeConnection(workspace, "halonic", {
        label: "Halonic",
        address: "https://evil.test",
        company: acme.company,
      });

      await expect(messaging.listAgents()).rejects.toThrow("Every messaging provider failed");
      expect(await messaging.listSources()).toMatchObject([{ state: { kind: "signed-out" } }]);
      expect(paperclip.seen).toEqual([]);
    });

    it("makes no call once it names another company", async () => {
      const { messaging } = await opened();
      await writeConnection(workspace, "halonic", { label: "Halonic", ...acme, company: "other" });

      await expect(messaging.listAgents()).rejects.toThrow("Every messaging provider failed");

      expect(paperclip.seen).toEqual([]);
    });
  });

  it("starts no provider from a key in the environment when none is stored", async () => {
    vi.stubEnv("PAPERCLIP_KEY", canaryKey);
    vi.stubEnv(
      "HALONIC_SECRET_HALONIC_TOKEN_PAPERCLIP_HALONIC",
      JSON.stringify({ key: canaryKey, ...acme }),
    );

    const { messaging, connected } = await opened({});
    await messaging.listAgents();

    expect(connected).toEqual([]);
    expect(await messaging.listSources()).toEqual([]);
    expect(paperclip.seen).toEqual([]);
  });

  it("starts no provider for a record whose address may not carry a key", async () => {
    const { connected } = await opened(
      storedRecord("halonic", {
        key: canaryKey,
        address: "http://paperclip.acme.test",
        company: acme.company,
      }),
    );

    expect(connected).toEqual([]);
  });

  it("keeps the key out of every answer and every logged failure", async () => {
    const { messaging } = await opened();
    await messaging.listAgents();
    paperclip.failing = true;

    const answers = await Promise.allSettled([
      messaging.listSources(),
      messaging.listAgents(),
      messaging.listConversations(),
      messaging.listInboxItems(),
      messaging.search("ship"),
    ]);
    const said = answers.map((answer) =>
      answer.status === "fulfilled" ? JSON.stringify(answer.value) : String(answer.reason),
    );

    expect(paperclip.seen.length).toBeGreaterThan(2);
    expect(said.join("\n")).not.toContain(canaryKey);
    expect(logged.join("\n")).not.toContain(canaryKey);
  });
});

verifies("agent-host.agent-messaging-offline", () => {
  it("caches outside the engine workspace, in files only the service user can read, with no key", async () => {
    const before = await filesUnder(workspace);
    const { messaging } = await opened();

    await messaging.listAgents();

    const cached = await filesUnder(cacheFolder);
    expect(cached.length).toBeGreaterThan(0);
    for (const file of cached) {
      expect((await stat(file)).mode & 0o777, file).toBe(0o600);
      const text = await readFile(file, "utf8");
      expect(text).not.toContain(canaryKey);
      expect(text.toLowerCase()).not.toContain("authorization");
    }
    expect(await filesUnder(workspace)).toEqual(before);
  });

  it("refuses a cache folder inside the engine workspace", async () => {
    cacheFolder = join(workspace, "cache");
    await mkdir(cacheFolder);

    await expect(opened()).rejects.toThrow(/inside the workspace/u);
  });

  it("reads from the cache while offline, as of the last live read, and refuses a message", async () => {
    const { messaging } = await opened();
    await messaging.listAgents();
    const [chat] = await messaging.listConversations();
    paperclip.offline = true;

    const agents = await messaging.listAgents();
    const sources = await messaging.listSources();
    const sent = await messaging.send(chat?.id ?? "", "Ship it");

    expect(agents.map((agent) => agent.name)).toEqual(["Ada", "Bo"]);
    expect(sources).toMatchObject([
      { state: { kind: "offline", asOf: "2026-11-24T14:00:00.000Z" } },
    ]);
    expect(sent).toEqual({ outcome: "refused", reason: "offline" });
  });
});
