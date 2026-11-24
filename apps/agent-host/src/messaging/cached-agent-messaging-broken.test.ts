import { createHash } from "node:crypto";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MessagingId } from "@halonicjs/ports";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CachedAgentMessaging } from "./cached-agent-messaging.ts";

/** Ways a cache file can be damaged or tampered with, each of which must read as missing. */
const damagedFiles = [
  ["garbage text", "not json {"],
  ["valid JSON of the wrong shape", '{"name":"acme"}\n'],
  ["items that are not a list", '{"asOf":"2026-11-24T14:02:00.000Z","items":{"0":{}}}\n'],
] as const;

function hashOf(id: MessagingId): string {
  return createHash("sha256").update(id).digest("hex");
}

verifies("agent-host.agent-messaging-cache", () => {
  describe("CachedAgentMessaging with a broken cache file", () => {
    let folder: string;
    let cacheFolder: string;
    let fake: FakeAgentMessaging;
    let warnings: string[];
    let messaging: CachedAgentMessaging;

    beforeEach(async () => {
      folder = await mkdtemp(join(tmpdir(), "halonic-messaging-cache-broken-"));
      cacheFolder = join(folder, "app-data", "messaging-cache");
      fake = new FakeAgentMessaging({ now: () => new Date("2026-11-24T14:02:00.000Z") });
      warnings = [];
      messaging = new CachedAgentMessaging(fake, {
        folder: cacheFolder,
        workspaceRoots: [join(folder, "acme-workspace")],
        warn: (message) => warnings.push(message),
      });
    });

    afterEach(async () => {
      await rm(folder, { recursive: true, force: true });
    });

    /** A source with a chat, a card and a task, all read once live, so each has a cache file. */
    async function readAcme() {
      const source = fake.addSource({ label: "Paperclip · Acme" });
      const chief = fake.addAgent(source.id, { name: "Chief" });
      const chat = fake.addConversation(chief.id);
      fake.addMessage(chat.id, { body: "The launch plan is ready." });
      fake.addInboxItem(source.id, { question: "Ship the launch plan?" });
      fake.addWork(source.id, { label: "ACME-1", title: "Launch plan" });
      await messaging.listConversations();
      await messaging.listMessages(chat.id);
      await messaging.listInboxItems();
      await messaging.listWork();
      return { source, chat, sourceFolder: join(cacheFolder, hashOf(source.id)) };
    }

    // The last live read file holds only a time, so a list of items has no bearing on it.
    it.each(damagedFiles.slice(0, 2))(
      "reads the last live read as missing with %s",
      async (_, text) => {
        const { source, sourceFolder } = await readAcme();
        await writeFile(join(sourceFolder, "as-of.json"), text);
        fake.goOffline(source.id);

        const [read] = await messaging.listSources();
        expect(read?.state.kind).toBe("offline");
        expect(warnings.join("")).toContain("as-of.json");
      },
    );

    it.each(damagedFiles)("reads an offline list as empty with %s", async (_, text) => {
      const { source, sourceFolder } = await readAcme();
      await writeFile(join(sourceFolder, "inbox.json"), text);
      fake.goOffline(source.id);

      expect(await messaging.listInboxItems()).toEqual([]);
      expect((await messaging.listWork()).map((work) => work.label)).toEqual(["ACME-1"]);
      expect(warnings.join("")).toContain("inbox.json");
    });

    it.each(damagedFiles)("searches the rest of an offline cache with %s", async (_, text) => {
      const { source, chat, sourceFolder } = await readAcme();
      await writeFile(join(sourceFolder, `messages-${hashOf(chat.id)}.json`), text);
      fake.goOffline(source.id);

      const hits = await messaging.search("launch");
      expect(hits.map((hit) => hit.kind).sort()).toEqual(["inbox-item", "work"]);
      expect(warnings.join("")).toContain(`messages-${hashOf(chat.id)}.json`);
    });

    it.each(damagedFiles)("still reads live messages with %s", async (_, text) => {
      const { chat, sourceFolder } = await readAcme();
      await writeFile(join(sourceFolder, "conversations.json"), text);

      const messages = await messaging.listMessages(chat.id);
      expect(messages.map((message) => message.body)).toEqual(["The launch plan is ready."]);
      expect(warnings.join("")).toContain("conversations.json");
    });

    it("leaves out another source's items in a swapped file", async () => {
      const { sourceFolder } = await readAcme();
      const other = fake.addSource({ label: "Paperclip · Globex" });
      fake.addInboxItem(other.id, { question: "Renew the lease?" });
      await messaging.listInboxItems();
      const otherFolder = join(cacheFolder, hashOf(other.id));
      await copyFile(join(sourceFolder, "inbox.json"), join(otherFolder, "inbox.json"));
      fake.goOffline(other.id);

      const questions = (await messaging.listInboxItems()).map((item) => item.question);
      expect(questions).toEqual(["Ship the launch plan?"]);
      expect(warnings.join("")).toContain("aren't its own");
    });
  });
});
