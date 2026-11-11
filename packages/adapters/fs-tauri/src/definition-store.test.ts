import { isUnreadableWorkspaceFolderError } from "@halonicjs/ports";
import { contentDigest, errorKindOf } from "@halonicjs/std";
import { definitionStoreContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { TauriDefinitionStore } from "./definition-store.ts";
import { FakeFileShell, notText } from "./fake-file-shell.test-helper.ts";
import { type FileRefusalKind, isFileRefusal, type TauriFileShell } from "./file-commands.ts";

const acme = "/workspaces/acme";

// The contract runs against the fake shell. That the shell compares and
// renames under one lock, and refuses links, is proved on real files by the
// Rust tests of the file commands in apps/studio/src-tauri.
definitionStoreContract(
  "tauri",
  async (files) => new TauriDefinitionStore(new FakeFileShell({ opened: [acme], files }), acme),
);

const sha256 = {
  async sha256(data: Uint8Array) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

/** The error a call rejects with. */
async function rejection(action: Promise<unknown>): Promise<unknown> {
  return action.then(
    () => expect.unreachable("the call should have failed"),
    (reason: unknown) => reason,
  );
}

/** A store whose shell answers every call with `answer`. */
function answering(answer: unknown): TauriDefinitionStore {
  const shell: TauriFileShell = {
    invoke: async () => answer,
    openChannel: () => ({ argument: "__CHANNEL__:0", close: () => {} }),
  };
  return new TauriDefinitionStore(shell, acme);
}

verifies("fs-tauri.write-if-unchanged-and-watch", () => {
  describe("TauriDefinitionStore", () => {
    it("names the workspace in every call, and leaves the comparing to the shell", async () => {
      const shell = new FakeFileShell({ opened: [acme], files: { "a.yaml": "1" } });
      const store = new TauriDefinitionStore(shell, acme);
      const expected = await contentDigest("1", sha256);
      await store.list();
      await store.list("hubs");
      await store.read("a.yaml");
      await store.write("a.yaml", "2", { expected });
      await store.write("b.yaml", "new");
      await store.remove("b.yaml");
      expect(store.location).toBe(acme);
      expect(shell.calls).toEqual([
        { command: "fs_list", args: { workspace: acme, dir: null } },
        { command: "fs_list", args: { workspace: acme, dir: "hubs" } },
        { command: "fs_read", args: { workspace: acme, path: "a.yaml" } },
        { command: "fs_write", args: { workspace: acme, path: "a.yaml", text: "2", expected } },
        {
          command: "fs_write",
          args: { workspace: acme, path: "b.yaml", text: "new", expected: null },
        },
        { command: "fs_remove", args: { workspace: acme, path: "b.yaml" } },
      ]);
    });

    it("refuses an unsafe or private path before calling the shell", async () => {
      const shell = new FakeFileShell({ opened: [acme] });
      const store = new TauriDefinitionStore(shell, acme);
      await expect(store.read("../outside.yaml")).rejects.toThrow(RangeError);
      await expect(store.write(".env", "A=1")).rejects.toThrow(RangeError);
      await expect(store.list(".git")).rejects.toThrow(RangeError);
      expect(shell.calls).toEqual([]);
    });

    it("refuses a path through a link, which only the shell can see, with a RangeError", async () => {
      const shell = new FakeFileShell({ opened: [acme], files: { "hubs/a/hub.yaml": "id: a\n" } });
      shell.links.add("hubs");
      const store = new TauriDefinitionStore(shell, acme);
      await expect(store.read("hubs/a/hub.yaml")).rejects.toThrow(RangeError);
      await expect(store.write("hubs/a/hub.yaml", "x")).rejects.toThrow(RangeError);
      await expect(store.remove("hubs/a/hub.yaml")).rejects.toThrow(RangeError);
      expect(await store.list()).toEqual([]);
      expect(shell.files.get("hubs/a/hub.yaml")).toBe("id: a\n");
    });

    it("names a folder the shell can't read", async () => {
      const shell = new FakeFileShell({ opened: [acme], files: { "hubs/a/hub.yaml": "id: a\n" } });
      shell.unreadable.add("hubs/a");
      const error = await rejection(new TauriDefinitionStore(shell, acme).list());
      expect(isUnreadableWorkspaceFolderError(error)).toBe(true);
      expect((error as { path: string }).path).toBe("hubs/a");
    });

    it("rejects a workspace the person didn't open with a denied error", async () => {
      const store = new TauriDefinitionStore(new FakeFileShell({ opened: [] }), acme);
      expect(errorKindOf(await rejection(store.read("a.yaml")))).toBe("denied");
    });

    it("rejects a file that isn't UTF-8 text with an invalid_input error", async () => {
      const shell = new FakeFileShell({ opened: [acme] });
      shell.files.set("logo.yaml", notText);
      const store = new TauriDefinitionStore(shell, acme);
      expect(errorKindOf(await rejection(store.read("logo.yaml")))).toBe("invalid_input");
    });

    it("keeps the shell's message for an io refusal", async () => {
      const shell = new FakeFileShell({ opened: [acme] });
      shell.refuseNext("io");
      const error = await rejection(new TauriDefinitionStore(shell, acme).write("a.yaml", "1"));
      expect(errorKindOf(error)).toBe("unavailable");
      expect((error as Error).message).toContain("refused by the test (io)");
    });

    it("drops the text of a rejection that isn't the shell's refusal", async () => {
      const shell = new FakeFileShell({ opened: [acme], granted: false });
      const error = await rejection(new TauriDefinitionStore(shell, acme).read("a.yaml"));
      expect(errorKindOf(error)).toBe("unavailable");
      expect((error as Error).message).not.toContain("ACL");
    });

    it("rejects an answer that isn't the command's with an unavailable error", async () => {
      const failures = [
        answering({}).list(),
        answering([1]).list(),
        answering(1).read("a.yaml"),
        answering({ status: "saved" }).write("a.yaml", "1"),
        answering({ status: "changed-on-disk", current: 1 }).write("a.yaml", "1"),
        answering(null).write("a.yaml", "1"),
        answering({ watchId: "w1" }).watch({ changed: () => {}, failed: () => {} }),
        answering(null).watch({ changed: () => {}, failed: () => {} }),
      ];
      for (const failure of failures) {
        expect(errorKindOf(await rejection(failure))).toBe("unavailable");
      }
    });

    it("tells the shell's refusal shape from other rejections", () => {
      const kinds: FileRefusalKind[] = ["folder_not_open", "unsafe_path", "private_path", "io"];
      for (const kind of kinds) {
        expect(isFileRefusal({ kind, message: "no" })).toBe(true);
      }
      expect(isFileRefusal({ kind: "folder_unreadable", message: "no", path: "hubs" })).toBe(true);
      expect(isFileRefusal({ kind: "folder_unreadable", message: "no", path: 1 })).toBe(false);
      expect(isFileRefusal({ kind: "other", message: "no" })).toBe(false);
      expect(isFileRefusal({ kind: "io" })).toBe(false);
      expect(isFileRefusal("Command fs_read not allowed by ACL")).toBe(false);
      expect(isFileRefusal(null)).toBe(false);
    });

    it("turns a path refusal the page didn't foresee into a RangeError", async () => {
      for (const kind of ["unsafe_path", "private_path"] as const) {
        const shell = new FakeFileShell({ opened: [acme] });
        shell.refuseNext(kind);
        await expect(new TauriDefinitionStore(shell, acme).read("a.yaml")).rejects.toThrow(
          RangeError,
        );
      }
    });

    it("leaves a file out of the version that went away while it was worked out", async () => {
      const shell: TauriFileShell = {
        invoke: async (command) => (command === "fs_list" ? ["a.yaml"] : null),
        openChannel: () => ({ argument: "__CHANNEL__:0", close: () => {} }),
      };
      const gone = await new TauriDefinitionStore(shell, acme).version();
      const empty = new TauriDefinitionStore(new FakeFileShell({ opened: [acme] }), acme);
      expect(gone).toBe(await empty.version());
    });

    it("has a fake shell that refuses an unsafe path and knows no rename command", async () => {
      const shell = new FakeFileShell({ opened: [acme] });
      expect(await rejection(shell.invoke("fs_read", { workspace: acme, path: "../x" }))).toEqual({
        kind: "unsafe_path",
        message: '"../x" is unsafe',
      });
      expect(await rejection(shell.invoke("fs_rename", { workspace: acme }))).toBe(
        "Command fs_rename not found",
      );
    });

    it("names the workspace root for an unreadable folder the shell didn't name", async () => {
      const shell: TauriFileShell = {
        invoke: async () => {
          throw { kind: "folder_unreadable", message: "permission denied" };
        },
        openChannel: () => ({ argument: "__CHANNEL__:0", close: () => {} }),
      };
      const error = await rejection(new TauriDefinitionStore(shell, acme).list());
      expect((error as { path: string }).path).toBe("");
    });
  });
});
