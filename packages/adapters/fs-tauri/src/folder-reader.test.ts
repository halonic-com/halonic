import { errorKindOf, KindedError } from "@halonicjs/std";
import { folderReaderContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeFolderShell } from "./fake-folder-shell.test-helper.ts";
import { type FolderRefusalKind, isFolderRefusal } from "./folder-commands.ts";
import { TauriFolderReader } from "./folder-reader.ts";

const acme = "/workspaces/acme";

// The contract runs against the fake shell. That the shell lists and reads
// real files as `FileSystemFolderReader` does, never through a link, is
// proved on real files by the Rust tests of crates/workspace-files.
folderReaderContract(
  "tauri",
  async (tree) => new TauriFolderReader(new FakeFolderShell({ opened: acme, tree }), acme),
  { specialFiles: true },
);

/** The error a call rejects with. */
async function rejection(action: Promise<unknown>): Promise<unknown> {
  return action.then(
    () => expect.unreachable("the call should have failed"),
    (reason: unknown) => reason,
  );
}

function readerOf(shell: FakeFolderShell, workspace = acme): TauriFolderReader {
  return new TauriFolderReader(shell, workspace);
}

verifies("fs-tauri.folder-reader", () => {
  describe("TauriFolderReader", () => {
    it("names the workspace in every call, and receives the bytes as base64url", async () => {
      const shell = new FakeFolderShell({ opened: acme, tree: { files: { "a/b": "hi" } } });
      const reader = readerOf(shell);
      expect(reader.location).toBe(acme);
      await reader.entries("a", { limit: 3, recursive: false });
      await reader.entries();
      expect(await reader.read("a/b")).toEqual(new TextEncoder().encode("hi"));
      await reader.locationOf("a");
      await reader.locationOf();
      expect(shell.calls).toEqual([
        {
          command: "folder_entries",
          args: { workspace: acme, dir: "a", limit: 3, recursive: false },
        },
        {
          command: "folder_entries",
          args: { workspace: acme, dir: null, limit: null, recursive: true },
        },
        { command: "folder_read", args: { workspace: acme, path: "a/b" } },
        { command: "folder_location", args: { workspace: acme, path: "a" } },
        { command: "folder_location", args: { workspace: acme, path: null } },
      ]);
    });

    it("only reads: it calls no command that writes or removes", async () => {
      const shell = new FakeFolderShell({ opened: acme, tree: { files: { a: "x" } } });
      const reader = readerOf(shell);
      await reader.entries();
      await reader.read("a");
      await reader.locationOf("a");
      const commands = new Set(shell.calls.map((call) => call.command));
      expect([...commands].sort()).toEqual(["folder_entries", "folder_location", "folder_read"]);
    });

    it("never calls the shell for an unsafe path", async () => {
      const shell = new FakeFolderShell({ opened: acme, tree: {} });
      const reader = readerOf(shell);
      await expect(reader.entries("../x")).rejects.toThrow(RangeError);
      await expect(reader.read("/x")).rejects.toThrow(RangeError);
      await expect(reader.locationOf("a//b")).rejects.toThrow(RangeError);
      expect(shell.calls).toEqual([]);
    });

    it("rejects with a denied error for a folder that isn't open", async () => {
      const shell = new FakeFolderShell({ opened: acme, tree: {} });
      const failure = await rejection(readerOf(shell, "/workspaces/other").entries());
      expect(failure).toBeInstanceOf(KindedError);
      expect(errorKindOf(failure)).toBe("denied");
    });

    it("rejects with a RangeError for a path the shell refuses, keeping its message", async () => {
      const refusals: FolderRefusalKind[] = ["unsafe_path", "private_path", "special_path"];
      for (const kind of refusals) {
        const shell = new FakeFolderShell({ opened: acme, tree: {} });
        shell.refuseNext(kind);
        const failure = await rejection(readerOf(shell).read("a"));
        expect(failure).toBeInstanceOf(RangeError);
        expect((failure as Error).message).toContain(kind);
      }
    });

    it("rejects with an unavailable error, keeping the message, for an unreadable folder or io", async () => {
      for (const kind of ["folder_unreadable", "io"] as const) {
        const shell = new FakeFolderShell({ opened: acme, tree: {} });
        shell.refuseNext(kind);
        const failure = await rejection(readerOf(shell).entries());
        expect(errorKindOf(failure)).toBe("unavailable");
        expect((failure as Error).message).toContain(kind);
      }
    });

    it("rejects with unavailable, without the shell's text, for a page without the capability", async () => {
      const shell = new FakeFolderShell({ opened: acme, tree: {}, granted: false });
      const failure = await rejection(readerOf(shell).entries());
      expect(errorKindOf(failure)).toBe("unavailable");
      expect((failure as Error).message).not.toContain("ACL");
    });

    it("rejects with unavailable for an answer that isn't the command's", async () => {
      const wrong: [(reader: TauriFolderReader) => Promise<unknown>, unknown][] = [
        [(reader) => reader.entries(), "not a list"],
        [(reader) => reader.entries(), [null]],
        [(reader) => reader.entries(), [{ path: 1, kind: "file", size: 1 }]],
        [(reader) => reader.entries(), [{ path: "a", kind: "file" }]],
        [(reader) => reader.entries(), [{ path: "a", kind: "file", size: -1 }]],
        [(reader) => reader.entries(), [{ path: "a", kind: "folder", size: 0 }]],
        [(reader) => reader.entries(), [{ path: "a", kind: "device" }]],
        [(reader) => reader.read("a"), 7],
        [(reader) => reader.read("a"), "not base64url!"],
        [(reader) => reader.locationOf(), 7],
      ];
      for (const [call, answer] of wrong) {
        const shell = new FakeFolderShell({ opened: acme, tree: {} });
        shell.answerNext(answer);
        const failure = await rejection(call(readerOf(shell)));
        expect(errorKindOf(failure)).toBe("unavailable");
      }
    });

    it("has a shell, for the tests, that checks paths again and knows only its commands", async () => {
      const shell = new FakeFolderShell({ opened: acme, tree: {} });
      const refused = await rejection(
        shell.invoke("folder_read", { workspace: acme, path: "../x" }),
      );
      expect(refused).toMatchObject({ kind: "unsafe_path" });
      await expect(shell.invoke("folder_write", { workspace: acme })).rejects.toMatch(/not found/u);
    });

    it("knows the shell's refusal shape", () => {
      expect(isFolderRefusal({ kind: "io", message: "x" })).toBe(true);
      expect(isFolderRefusal({ kind: "folder_unreadable", message: "x", path: "a" })).toBe(true);
      expect(isFolderRefusal(null)).toBe(false);
      expect(isFolderRefusal("text")).toBe(false);
      expect(isFolderRefusal({ kind: "nope", message: "x" })).toBe(false);
      expect(isFolderRefusal({ kind: "io", message: 1 })).toBe(false);
      expect(isFolderRefusal({ kind: "io", message: "x", path: 1 })).toBe(false);
    });
  });
});
