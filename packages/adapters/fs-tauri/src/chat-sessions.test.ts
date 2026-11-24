import { errorKindOf } from "@halonicjs/std";
import { chatSessionsContract, savedChat } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { TauriChatSessions } from "./chat-sessions.ts";
import { FakeFileShell, notText } from "./fake-file-shell.test-helper.ts";

const acme = "/workspaces/acme";

/** The workspaces the contract keeps chats in, all opened in the shell. */
const contractLocations = [
  acme,
  "/workspaces/acme/",
  "/Workspaces/acme",
  "/workspaces",
  "/workspaces/acme/c-1",
  "/workspaces/globex",
  "/workspaces/never",
];

chatSessionsContract("tauri", async () => {
  const shell = new FakeFileShell({ opened: contractLocations });
  return {
    store: new TauriChatSessions(shell),
    // Cut the file in half, as a crash or a full disk would.
    damage: async (location, id) => {
      const files = shell.chatsOf(location).files;
      files.set(`${id}.json`, String(files.get(`${id}.json`)).slice(0, 20));
    },
  };
});

function openShell(): FakeFileShell {
  return new FakeFileShell({ opened: [acme] });
}

verifies("fs-tauri.chat-sessions", () => {
  it("keeps each chat as <id>.json in the workspace's chats folder, never in the workspace", async () => {
    const shell = openShell();
    await new TauriChatSessions(shell).save(acme, savedChat("c-1"));
    expect(shell.calls).toEqual([
      {
        command: "fs_write",
        args: {
          workspace: acme,
          folder: "chats",
          path: "c-1.json",
          text: `${JSON.stringify(savedChat("c-1"), null, 2)}\n`,
          expected: null,
        },
      },
    ]);
    expect(shell.files.size).toBe(0);
  });

  it("leaves out other files, text that isn't UTF-8 and a chat naming another id", async () => {
    const shell = openShell();
    const store = new TauriChatSessions(shell);
    await store.save(acme, savedChat("c-1"));
    const chats = shell.chatsOf(acme).files;
    chats.set("notes.txt", "hello");
    chats.set("C-2.json", JSON.stringify({ ...savedChat("c-2"), id: "C-2" }));
    chats.set("c-3.json", notText);
    chats.set("c-4.json", JSON.stringify(savedChat("c-1")));
    expect((await store.list(acme)).map((chat) => chat.id)).toEqual(["c-1"]);
    expect(await store.load(acme, "c-3")).toBeNull();
    expect(await store.load(acme, "c-4")).toBeNull();
    await store.delete(acme, "c-3");
    expect(chats.has("c-3.json")).toBe(false);
  });

  it("breaks a tie by id, whatever order the shell lists the files in", async () => {
    const texts: Record<string, string> = {
      "b.json": JSON.stringify(savedChat("b")),
      "a.json": JSON.stringify(savedChat("a")),
    };
    const store = new TauriChatSessions({
      invoke: async (command, args = {}) =>
        command === "fs_list" ? ["b.json", "a.json"] : texts[String(args["path"])],
    });
    expect((await store.list(acme)).map((chat) => chat.id)).toEqual(["a", "b"]);
  });

  it("rejects a workspace the person didn't open as denied", async () => {
    const store = new TauriChatSessions(openShell());
    const failure = await store.list("/workspaces/globex").catch((error: unknown) => error);
    expect(errorKindOf(failure)).toBe("denied");
  });

  it("rejects any other refusal, or no refusal shape, as unavailable", async () => {
    const shell = openShell();
    const store = new TauriChatSessions(shell);
    shell.refuseNext("io", "fs_read");
    const io = await store.load(acme, "c-1").catch((error: unknown) => error);
    expect(errorKindOf(io)).toBe("unavailable");
    expect((io as Error).message).toContain("refused by the test (io)");
    const blocked = new TauriChatSessions(new FakeFileShell({ opened: [acme], granted: false }));
    const denied = await blocked.list(acme).catch((error: unknown) => error);
    expect(errorKindOf(denied)).toBe("unavailable");
    expect((denied as Error).message).not.toContain("ACL");
  });

  it("rejects an answer the shell would never give as unavailable", async () => {
    const changed = new TauriChatSessions({ invoke: async () => ({ status: "changed-on-disk" }) });
    await expect(changed.save(acme, savedChat("c-1"))).rejects.toThrow("no answer");
    const store = new TauriChatSessions({ invoke: async () => 7 });
    await expect(store.load(acme, "c-1")).rejects.toThrow("no answer");
    await expect(store.list(acme)).rejects.toThrow("no answer");
    await expect(store.save(acme, savedChat("c-1"))).rejects.toThrow("no answer");
  });
});
