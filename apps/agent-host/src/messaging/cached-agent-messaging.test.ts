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
    readAttachment: (attachment) => fake.readAttachment(attachment),
    send: (conversation, body, attachments, options) =>
      fake.send(conversation, body, attachments, options),
    startChannel: (title, members, lead) => fake.startChannel(title, members, lead),
    setMembers: (channel, members, lead) => fake.setMembers(channel, members, lead),
    browseChannels: () => fake.browseChannels(),
    joinChannel: (channel) => fake.joinChannel(channel),
    leaveChannel: (channel) => fake.leaveChannel(channel),
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

    it("keeps an offline message's file listing, and reads its bytes only from the source", async () => {
      const { source, chat } = await readAcme();
      const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
      fake.addMessage(chat.id, {
        body: "The plan's chart",
        attachments: [{ name: "chart.png", type: "image/png", bytes }],
      });
      const live = await messaging.listMessages(chat.id);
      const file = live.at(-1)?.attachments[0];
      expect(file).toMatchObject({ name: "chart.png", type: "image/png", size: 8 });
      expect(await messaging.readAttachment(file?.id ?? "")).toEqual({
        outcome: "read",
        bytes,
        type: "image/png",
      });

      fake.goOffline(source.id);
      expect((await messaging.listMessages(chat.id)).at(-1)?.attachments).toEqual([file]);
      expect(await messaging.readAttachment(file?.id ?? "")).toEqual({
        outcome: "refused",
        reason: "offline",
      });
      for (const cacheFile of await filesUnder(cacheFolder)) {
        expect(await readFile(cacheFile, "utf8")).not.toContain('"bytes"');
      }
    });

    it("sends a message's files straight to the source, and caches none of their bytes", async () => {
      const { chat } = await readAcme();
      const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
      const sent = await messaging.send(chat.id, "Here's the chart", [
        { name: "chart.png", type: "image/png", bytes },
      ]);
      expect(sent.outcome).toBe("sent");
      const file = (await messaging.listMessages(chat.id)).at(-1)?.attachments[0];
      expect(file).toMatchObject({ name: "chart.png", type: "image/png", size: 8 });
      for (const cacheFile of await filesUnder(cacheFolder)) {
        expect(await readFile(cacheFile, "utf8")).not.toContain('"bytes"');
      }
    });

    it("keeps a channel's members, who a message was for and its work lines for an offline read", async () => {
      const { source } = await readAcme();
      const [chief] = await messaging.listAgents();
      const elena = fake.addAgent(source.id, { name: "Elena" });
      const started = await messaging.startChannel("Launch", [chief?.id ?? "", elena.id], elena.id);
      if (started.outcome !== "done") throw new Error(`no channel: ${started.reason}`);
      const channel = started.conversation;
      const since = "2026-11-24T14:03:00.000Z";
      fake.addMessage(channel.id, {
        author: { kind: "me" },
        body: "Can you both check this?",
        to: [elena.id],
        work: [{ agent: elena.id, state: "working", work: "acme-task-7", since }],
      });
      fake.addInboxItem(source.id, { question: "Buy 2 more seats?", risk: "risky" });
      const live = {
        conversations: await messaging.listConversations(),
        messages: await messaging.listMessages(channel.id),
        inbox: await messaging.listInboxItems(),
      };
      fake.goOffline(source.id);

      expect(await messaging.listConversations()).toEqual(live.conversations);
      expect(live.conversations.find((each) => each.id === channel.id)?.members).toEqual(
        channel.members,
      );
      expect(await messaging.listMessages(channel.id)).toEqual(live.messages);
      expect(live.messages.at(-1)).toMatchObject({ to: [elena.id], work: [{ state: "working" }] });
      expect(await messaging.listInboxItems()).toEqual(live.inbox);
      expect(live.inbox[0]?.risk).toBe("risky");
    });

    it("keeps an action item and its action-result answer for an offline read", async () => {
      const { source } = await readAcme();
      const action = {
        definition: "github.approve-run",
        version: 1,
        parameters: { owner: "acme", repo: "app", runId: 123456 },
        expect: { headSha: "abc1234" },
        expires: "2026-11-25T13:00:00.000Z",
      };
      const item = fake.addInboxItem(source.id, { question: "The release run waits.", action });
      const result = {
        kind: "action-result",
        outcome: "succeeded",
        steps: [{ step: 1, outcome: "succeeded", status: 201, kept: { state: "approved" } }],
      } as const;
      expect((await messaging.answer(item.id, result)).outcome).toBe("answered");
      const live = await messaging.listInboxItems();

      fake.goOffline(source.id);
      const offline = (await messaging.listInboxItems()).find((kept) => kept.id === item.id);
      expect(offline).toEqual(live.find((kept) => kept.id === item.id));
      expect(offline?.action).toEqual(action);
      expect(offline?.state).toMatchObject({ kind: "answered", answer: result });
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
