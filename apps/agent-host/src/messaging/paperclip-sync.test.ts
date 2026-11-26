import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { acme, type Desktop, startDesktop, testKey } from "./desktop-messaging.test-helper.ts";
import { syncFolderName } from "./sync-files.ts";

let desktop: Desktop | undefined;

afterEach(async () => {
  await desktop?.close();
  desktop = undefined;
});

/** A desktop with `halonic` connected the way Studio does it, and synced once by the first poll. */
async function synced(): Promise<Desktop> {
  desktop = await startDesktop();
  desktop.paperclip.servesInbox = true;
  await desktop.paperclipKey.handOver({
    workspace: desktop.workspace,
    connection: "halonic",
    key: testKey,
    ...acme,
  });
  await desktop.wait(30_000);
  return desktop;
}

/** Every file of every local copy under the profile's messaging cache folder. */
async function syncFilesIn(on: Desktop): Promise<string[]> {
  const cache = join(on.profile, "agent-messaging-cache");
  const entries = await readdir(cache, { recursive: true }).catch(() => []);
  return entries
    .filter((entry) => entry.split(/[\\/]/).includes(syncFolderName) && entry.endsWith(".json"))
    .map((entry) => join(cache, entry));
}

verifies("agent-host.paperclip-sync", () => {
  describe("the desktop engine's local copy of a Paperclip connection", () => {
    it("answers the Inbox and the Messenger's lists with no request to Paperclip after one sync", async () => {
      const on = await synced();
      expect(on.logged).toEqual([]);
      expect(on.paperclip.seen.length).toBeGreaterThan(0);
      on.paperclip.seen.length = 0;

      const conversations = await on.studio.listConversations();
      await on.studio.listInboxItems();

      expect(conversations.map((conversation) => conversation.title)).toEqual(["Chat with Ada"]);
      expect(on.paperclip.seen).toEqual([]);
    });

    it("still sends a search to Paperclip", async () => {
      const on = await synced();
      on.paperclip.seen.length = 0;

      await on.studio.search("release");

      const urls = on.paperclip.seen.map((request) => request.url);
      expect(urls.some((url) => new URL(url).searchParams.get("q") === "release")).toBe(true);
    });

    it("keeps its files at 0600 in a 0700 folder, outside the workspace", async () => {
      const on = await synced();
      const files = await syncFilesIn(on);
      expect(files.map((file) => file.split(/[\\/]/).at(-1)).sort()).toEqual([
        "agents.json",
        "conversations.json",
        "inbox.json",
        "work.json",
      ]);
      for (const file of files) {
        expect(file.startsWith(on.workspace)).toBe(false);
        expect(await readFile(file, "utf8")).not.toContain(testKey);
        if (process.platform !== "win32") {
          expect((await stat(file)).mode & 0o777).toBe(0o600);
          expect((await stat(dirname(file))).mode & 0o777).toBe(0o700);
        }
      }
    });
  });
});

verifies("agent-host.agent-messaging-cache", () => {
  it("deletes a Paperclip source's local copy when Disconnect clears the source", async () => {
    const on = await synced();
    expect(await syncFilesIn(on)).not.toEqual([]);

    await on.paperclipKey.disconnect({ workspace: on.workspace, connection: "halonic" });

    expect(await syncFilesIn(on)).toEqual([]);
  });
});
