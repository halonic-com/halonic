import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentMessaging, MessagingId, MessagingSource } from "@halonicjs/ports";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CachedAgentMessaging } from "./cached-agent-messaging.ts";

const testKey = "pcp_board_acme-test-key-0000";

/**
 * A provider as the Paperclip one behaves, over the fake: it holds a key and
 * hangs its request on every item it returns, and its reads throw while the
 * line is cut. Like a provider that just started, it says offline as of now.
 */
function keyedProvider(fake: FakeAgentMessaging, now: () => Date): AgentMessaging {
  const request = { headers: { Authorization: `Bearer ${testKey}` }, key: testKey };
  const read =
    <Item extends object>(list: () => Promise<readonly Item[]>) =>
    async () => {
      const sources = await fake.listSources();
      if (sources.some((source) => source.state.kind === "offline")) {
        throw new Error("fetch failed");
      }
      return (await list()).map((item) => ({ ...item, request }));
    };
  return {
    listSources: async () =>
      (await fake.listSources()).map(
        (source): MessagingSource =>
          source.state.kind === "offline"
            ? { ...source, state: { kind: "offline", asOf: now().toISOString() } }
            : source,
      ),
    listAgents: read(() => fake.listAgents()),
    listConversations: read(() => fake.listConversations()),
    listMessages: (conversation: MessagingId) => read(() => fake.listMessages(conversation))(),
    listInboxItems: read(() => fake.listInboxItems()),
    listWork: read(() => fake.listWork()),
    search: (text: string) => read(() => fake.search(text))(),
    answer: (item, answer) => fake.answer(item, answer),
    send: (conversation, body) => fake.send(conversation, body),
    changes: () => fake.changes(),
  };
}

async function filesUnder(folder: string): Promise<string[]> {
  const entries = await readdir(folder, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

verifies("agent-host.agent-messaging-cache", () => {
  describe("CachedAgentMessaging", () => {
    let folder: string;
    let cacheFolder: string;
    let workspace: string;
    let now: Date;
    let fake: FakeAgentMessaging;
    let messaging: CachedAgentMessaging;

    beforeEach(async () => {
      folder = await mkdtemp(join(tmpdir(), "halonic-messaging-cache-"));
      cacheFolder = join(folder, "app-data", "messaging-cache");
      workspace = join(folder, "acme-workspace");
      await mkdir(workspace);
      await writeFile(join(workspace, "halonic.yaml"), "name: acme\n");
      now = new Date("2026-11-24T14:02:00.000Z");
      fake = new FakeAgentMessaging({ now: () => now });
      messaging = new CachedAgentMessaging(
        keyedProvider(fake, () => now),
        {
          folder: cacheFolder,
          workspaceRoots: [workspace],
          warn: (message) => {
            throw new Error(`unexpected cache warning: ${message}`);
          },
        },
      );
    });

    afterEach(async () => {
      await rm(folder, { recursive: true, force: true });
    });

    /** A source with an agent, a chat with one message, an open card and a task, all read once live. */
    async function readAcme() {
      const source = fake.addSource({ label: "Paperclip · Acme" });
      const chief = fake.addAgent(source.id, { name: "Chief", title: "CEO" });
      const chat = fake.addConversation(chief.id);
      fake.addMessage(chat.id, { body: "The launch plan is ready." });
      const card = fake.addInboxItem(source.id, { question: "Ship the launch plan?" });
      fake.addWork(source.id, { label: "ACME-1", title: "Launch plan" });
      const live = {
        agents: await messaging.listAgents(),
        conversations: await messaging.listConversations(),
        messages: await messaging.listMessages(chat.id),
        inbox: await messaging.listInboxItems(),
        work: await messaging.listWork(),
      };
      return { source, chat, card, live };
    }

    it("answers an offline source's reads from the cache, offline as of the cached read", async () => {
      const { source, chat, live } = await readAcme();
      now = new Date("2026-11-24T15:30:00.000Z");
      fake.goOffline(source.id);

      expect(await messaging.listSources()).toEqual([
        { ...source, state: { kind: "offline", asOf: "2026-11-24T14:02:00.000Z" } },
      ]);
      expect(await messaging.listAgents()).toEqual(live.agents);
      expect(await messaging.listConversations()).toEqual(live.conversations);
      expect(await messaging.listMessages(chat.id)).toEqual(live.messages);
      expect(await messaging.listInboxItems()).toEqual(live.inbox);
      expect(await messaging.listWork()).toEqual(live.work);
      expect(live.inbox.map((item) => item.question)).toEqual(["Ship the launch plan?"]);
      expect((await messaging.search("launch")).map((hit) => hit.kind).sort()).toEqual([
        "inbox-item",
        "message",
        "work",
      ]);
    });

    it("refuses an answer and a message offline, and sends neither when the line comes back", async () => {
      const { source, chat, card } = await readAcme();
      fake.goOffline(source.id);

      expect(await messaging.answer(card.id, { kind: "option", option: "yes" })).toEqual({
        outcome: "refused",
        reason: "offline",
      });
      expect(await messaging.send(chat.id, "Go ahead")).toEqual({
        outcome: "refused",
        reason: "offline",
      });

      fake.goOnline(source.id);
      const messages = await messaging.listMessages(chat.id);
      expect(messages.map((message) => message.body)).toEqual(["The launch plan is ready."]);
      const [item] = await messaging.listInboxItems();
      expect(item?.state).toEqual({ kind: "open" });
    });

    it("keeps no key, Authorization header or request in any cache file", async () => {
      await readAcme();
      const files = await filesUnder(cacheFolder);
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        const text = await readFile(file, "utf8");
        expect(text).not.toContain(testKey);
        expect(text).not.toContain("Authorization");
        expect(text).not.toContain("request");
      }
    });

    it("writes nothing inside the workspace, and refuses a cache folder inside one", async () => {
      await readAcme();
      expect(await filesUnder(workspace)).toEqual([join(workspace, "halonic.yaml")]);
      expect(
        () =>
          new CachedAgentMessaging(fake, {
            folder: join(workspace, ".halonic", "cache"),
            workspaceRoots: [workspace],
            warn: () => {},
          }),
      ).toThrow(/inside the workspace/);
    });

    it("clear deletes the source's cache and keeps the other sources'", async () => {
      const { source } = await readAcme();
      const other = fake.addSource({ label: "Paperclip · Globex" });
      fake.addInboxItem(other.id, { question: "Renew the lease?" });
      await messaging.listInboxItems();
      const before = await readdir(cacheFolder);
      expect(before).toHaveLength(2);

      await messaging.clear(source.id);

      const after = await readdir(cacheFolder);
      expect(after).toHaveLength(1);
      fake.goOffline(source.id);
      fake.goOffline(other.id);
      expect((await messaging.listInboxItems()).map((item) => item.question)).toEqual([
        "Renew the lease?",
      ]);
    });

    it("lets a failed read's error stand while a source is online", async () => {
      const failing: AgentMessaging = {
        ...keyedProvider(fake, () => now),
        listWork: () => Promise.reject(new Error("Paperclip answered 500")),
      };
      fake.addSource({ label: "Paperclip · Acme" });
      const cached = new CachedAgentMessaging(failing, {
        folder: cacheFolder,
        workspaceRoots: [workspace],
        warn: () => {},
      });
      await expect(cached.listWork()).rejects.toThrow("Paperclip answered 500");
    });

    it("keeps every cache file 0600 in 0700 folders on POSIX", async () => {
      await readAcme();
      const files = await filesUnder(cacheFolder);
      expect(files.length).toBeGreaterThan(0);
      // Windows has no POSIX file modes to check; the files still have to exist there.
      if (process.platform === "win32") return;
      for (const file of files) expect((await stat(file)).mode & 0o777).toBe(0o600);
      const [sourceFolder] = await readdir(cacheFolder);
      expect((await stat(cacheFolder)).mode & 0o777).toBe(0o700);
      expect((await stat(join(cacheFolder, sourceFolder ?? ""))).mode & 0o777).toBe(0o700);
    });
  });
});
