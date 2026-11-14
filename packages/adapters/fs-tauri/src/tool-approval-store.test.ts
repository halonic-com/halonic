import { isUnreadableToolApprovalError, type ToolApprovalKey } from "@halonicjs/ports";
import { errorKindOf } from "@halonicjs/std";
import {
  toolApproval,
  toolApprovalStoreContract,
  waitingVersion,
} from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeFileShell, notText } from "./fake-file-shell.test-helper.ts";
import { hashText } from "./tool-approval-files.ts";
import { TauriToolApprovalStore } from "./tool-approval-store.ts";

const workspace = "/workspaces/acme";
const lookup: ToolApprovalKey = { location: workspace, source: "notes", name: "lookup" };

function openShell(): FakeFileShell {
  return new FakeFileShell({ opened: [workspace] });
}

async function fileOf(key: ToolApprovalKey): Promise<string> {
  return `${await hashText(key.name)}.json`;
}

/** The workspaces the contract keeps approvals in. */
const contractLocations = [
  "/w",
  "/w/a",
  "/w/a/b",
  "/workspaces/acme",
  "/workspaces/acme-2",
  "/workspaces/acme/",
  "/workspaces/never",
];

toolApprovalStoreContract("tauri", async () => {
  const shell = new FakeFileShell({ opened: contractLocations });
  return {
    store: new TauriToolApprovalStore(shell),
    // Cut the file in half, as a crash or a full disk would.
    damage: async (key) => {
      const files = shell.approvalsOf(key.location, key.source).files;
      const file = await fileOf(key);
      const text = files.get(file);
      if (typeof text !== "string") throw new Error("There is no approval to damage.");
      files.set(file, text.slice(0, text.length / 2));
    },
  };
});

/** The error a call rejects with. */
async function rejection(action: Promise<unknown>): Promise<unknown> {
  return action.then(
    () => expect.unreachable("the call should have failed"),
    (reason: unknown) => reason,
  );
}

verifies("fs-tauri.tool-approval-store", () => {
  describe("TauriToolApprovalStore", () => {
    it("works in the tool-approvals folder of the key's source, naming only the store's files", async () => {
      const shell = openShell();
      const store = new TauriToolApprovalStore(shell);
      await store.approve(toolApproval());
      await store.get(lookup);
      const file = await fileOf(lookup);
      const writes = shell.calls.filter((call) => call.command === "fs_write");
      expect(writes.map((call) => call.args?.["path"])).toEqual([file]);
      for (const call of shell.calls) {
        expect(call.args).toMatchObject({ workspace, folder: "tool-approvals", source: "notes" });
      }
      expect(shell.approvalsOf(workspace, "notes").files.has(file)).toBe(true);
      expect(shell.files.size).toBe(0);
    });

    it("lists only the files named like an approval", async () => {
      const shell = openShell();
      const store = new TauriToolApprovalStore(shell);
      await store.approve(toolApproval());
      shell.approvalsOf(workspace, "notes").files.set("lock", "");
      shell.approvalsOf(workspace, "notes").files.set("other.json", "{}");
      expect((await store.list(workspace, "notes")).map((approval) => approval.name)).toEqual([
        "lookup",
      ]);
    });

    it("rejects an approval file that doesn't name its own tool, naming the file", async () => {
      const shell = openShell();
      const store = new TauriToolApprovalStore(shell);
      shell.approvalsOf(workspace, "notes").files.set(`${"a".repeat(64)}.json`, "{}");
      const error = await rejection(store.list(workspace, "notes"));
      expect(isUnreadableToolApprovalError(error)).toBe(true);
    });

    it("rejects a list when a file can't be read as text, naming the file", async () => {
      const shell = openShell();
      const store = new TauriToolApprovalStore(shell);
      await store.approve(toolApproval());
      shell.refuseNext("not_text", "fs_read");
      const error = await rejection(store.list(workspace, "notes"));
      expect(isUnreadableToolApprovalError(error)).toBe(true);
    });

    it("never overwrites an approval a newer Halonic wrote", async () => {
      const shell = openShell();
      const store = new TauriToolApprovalStore(shell);
      const files = shell.approvalsOf(workspace, "notes").files;
      const file = await fileOf(lookup);
      await store.approve(toolApproval());
      const written = files.get(file);
      if (typeof written !== "string") throw new Error("There is no approval.");
      const newer = written.replace('"format": 1', '"format": 2');
      files.set(file, newer);
      const error = await rejection(store.approve(toolApproval({}, 2)));
      expect(isUnreadableToolApprovalError(error)).toBe(true);
      expect(files.get(file)).toBe(newer);
    });

    it("keeps a newer Halonic's waiting file and starts a damaged one again", async () => {
      const shell = openShell();
      const store = new TauriToolApprovalStore(shell);
      const files = shell.approvalsOf(workspace, "notes").files;
      await store.noteWaiting(lookup, waitingVersion(1));
      const written = files.get("waiting.json");
      if (typeof written !== "string") throw new Error("There is nothing waiting.");
      const newer = written.replace('"format": 1', '"format": 2');
      files.set("waiting.json", newer);
      await store.approve(toolApproval());
      expect(files.get("waiting.json")).toBe(newer);
      await expect(store.noteWaiting(lookup, waitingVersion(2))).rejects.toThrow(/newer Halonic/u);
      files.set("waiting.json", "{ not json");
      await store.revoke(lookup);
      expect(files.has("waiting.json")).toBe(false);
      files.set("waiting.json", "{ not json");
      expect(await store.noteWaiting(lookup, waitingVersion(3))).toEqual([waitingVersion(3)]);
    });

    it("keeps the other tools' waiting versions when one is approved", async () => {
      const shell = openShell();
      const store = new TauriToolApprovalStore(shell);
      await store.noteWaiting(lookup, waitingVersion(1));
      await store.noteWaiting({ ...lookup, name: "search" }, waitingVersion(2));
      await store.approve(toolApproval());
      expect(await store.noteWaiting({ ...lookup, name: "search" }, waitingVersion(2))).toEqual([
        waitingVersion(2),
      ]);
      expect(shell.approvalsOf(workspace, "notes").files.has("waiting.json")).toBe(true);
    });

    it("reads again when another write came between its read and its write, and keeps both", async () => {
      const shell = openShell();
      const store = new TauriToolApprovalStore(shell);
      const other = new TauriToolApprovalStore(shell);
      let interrupted = false;
      const invoke = shell.invoke.bind(shell);
      shell.invoke = async (command, args) => {
        const answer = await invoke(command, args);
        if (command === "fs_read" && !interrupted) {
          interrupted = true;
          await other.noteWaiting({ ...lookup, name: "search" }, waitingVersion(2));
        }
        return answer;
      };
      await store.noteWaiting(lookup, waitingVersion(1));
      expect(await store.noteWaiting({ ...lookup, name: "search" }, waitingVersion(2))).toEqual([
        waitingVersion(2),
      ]);
      expect(await store.noteWaiting(lookup, waitingVersion(1))).toEqual([waitingVersion(1)]);
    });

    it("gives up with an unavailable error when every attempt finds another write", async () => {
      const shell = openShell();
      const store = new TauriToolApprovalStore(shell);
      const other = new TauriToolApprovalStore(shell);
      let changes = 0;
      let interfering = false;
      const invoke = shell.invoke.bind(shell);
      shell.invoke = async (command, args) => {
        const answer = await invoke(command, args);
        // The other store's own reads must not start another write.
        if (command === "fs_read" && !interfering) {
          interfering = true;
          changes += 1;
          await other.noteWaiting({ ...lookup, name: `tool-${changes}` }, waitingVersion(changes));
          interfering = false;
        }
        return answer;
      };
      const error = await rejection(store.noteWaiting(lookup, waitingVersion(1)));
      expect(errorKindOf(error)).toBe("unavailable");
    });

    it("turns the shell's refusals into the errors the port asks for", async () => {
      const shell = openShell();
      const store = new TauriToolApprovalStore(shell);
      shell.refuseNext("unsafe_path");
      expect(await rejection(store.get(lookup))).toBeInstanceOf(RangeError);
      await store.approve(toolApproval());
      shell.refuseNext("private_path", "fs_read");
      expect(await rejection(store.list(workspace, "notes"))).toBeInstanceOf(RangeError);
      shell.refuseNext("io", "fs_list");
      expect(errorKindOf(await rejection(store.list(workspace, "notes")))).toBe("unavailable");
      const closed = new TauriToolApprovalStore(openShell());
      expect(
        errorKindOf(await rejection(closed.revoke({ ...lookup, location: "/elsewhere" }))),
      ).toBe("denied");
    });

    it("rejects without repeating the text of a rejection that isn't the shell's refusal", async () => {
      const store = new TauriToolApprovalStore(
        new FakeFileShell({ opened: [workspace], granted: false }),
      );
      expect(errorKindOf(await rejection(store.get(lookup)))).toBe("unavailable");
      const listed = await rejection(store.list(workspace, "notes"));
      expect(errorKindOf(listed)).toBe("unavailable");
      expect(String((listed as Error).message)).not.toContain("ACL");
    });

    it("rejects an answer that isn't what the shell gives", async () => {
      const shell = openShell();
      const store = new TauriToolApprovalStore(shell);
      const answers: Record<string, unknown> = {
        fs_list: "x",
        fs_read: 3,
        fs_write: { status: "?" },
      };
      shell.invoke = async (command) => answers[command] ?? null;
      expect(errorKindOf(await rejection(store.list(workspace, "notes")))).toBe("unavailable");
      expect(errorKindOf(await rejection(store.noteWaiting(lookup, waitingVersion(1))))).toBe(
        "unavailable",
      );
      answers["fs_write"] = null;
      answers["fs_read"] = null;
      expect(errorKindOf(await rejection(store.noteWaiting(lookup, waitingVersion(1))))).toBe(
        "unavailable",
      );
      answers["fs_write"] = { status: "?" };
      expect(errorKindOf(await rejection(store.noteWaiting(lookup, waitingVersion(1))))).toBe(
        "unavailable",
      );
    });

    it("rejects a get of a file that isn't text, or that a newer Halonic wrote, naming the tool", async () => {
      const shell = openShell();
      const store = new TauriToolApprovalStore(shell);
      await store.approve(toolApproval());
      shell.refuseNext("not_text", "fs_read");
      expect(isUnreadableToolApprovalError(await rejection(store.get(lookup)))).toBe(true);
      const files = shell.approvalsOf(workspace, "notes").files;
      const file = await fileOf(lookup);
      files.set(file, String(files.get(file)).replace('"format": 1', '"format": 2'));
      expect(isUnreadableToolApprovalError(await rejection(store.get(lookup)))).toBe(true);
    });

    it("names files by the hashes the CLI's store uses, fixed here so a change in hashText shows", async () => {
      expect(await hashText("lookup")).toBe(
        "6a7ef6b04498ace6346e6d74712b9ddc4f4f362370b48986239596c5dc567cb3",
      );
      // A lone surrogate, which UTF-8 would turn into U+FFFD.
      expect(await hashText("\ud800")).toBe(
        "205022e3428b7c8276cf247b36e4e512db5651e5cb3472c253d9ee893a8ac750",
      );
    });

    it("treats a file that isn't text as damaged when it approves, revokes or notes waiting", async () => {
      const shell = openShell();
      const store = new TauriToolApprovalStore(shell);
      const files = shell.approvalsOf(workspace, "notes").files;
      await store.approve(toolApproval());
      shell.refuseNext("not_text", "fs_read");
      await store.approve(toolApproval({}, 2));
      expect(await store.get(lookup)).toEqual(toolApproval({}, 2));
      await store.noteWaiting(lookup, waitingVersion(1));
      shell.refuseNext("not_text", "fs_read");
      await store.revoke(lookup);
      expect(files.has("waiting.json")).toBe(false);
      await store.noteWaiting(lookup, waitingVersion(1));
      files.set("waiting.json", notText);
      expect(await store.noteWaiting(lookup, waitingVersion(2))).toEqual([waitingVersion(2)]);
    });

    it("rejects a list when a file's tool doesn't hash to its name", async () => {
      const shell = openShell();
      const store = new TauriToolApprovalStore(shell);
      await store.approve(toolApproval());
      const files = shell.approvalsOf(workspace, "notes").files;
      files.set(`${"b".repeat(64)}.json`, String(files.get(await fileOf(lookup))));
      expect(isUnreadableToolApprovalError(await rejection(store.list(workspace, "notes")))).toBe(
        true,
      );
    });

    it("skips an approval revoked after the folder was listed", async () => {
      const shell = openShell();
      const store = new TauriToolApprovalStore(shell);
      await store.approve(toolApproval());
      const invoke = shell.invoke.bind(shell);
      shell.invoke = async (command, args) => {
        const answer = await invoke(command, args);
        if (command === "fs_list") await store.revoke(lookup);
        return answer;
      };
      expect(await store.list(workspace, "notes")).toEqual([]);
    });

    it("keeps a waiting version noted between its read and its removal of the last entry", async () => {
      const shell = openShell();
      const store = new TauriToolApprovalStore(shell);
      const other = new TauriToolApprovalStore(shell);
      const files = shell.approvalsOf(workspace, "notes").files;
      await store.noteWaiting(lookup, waitingVersion(1));
      let interrupted = false;
      const invoke = shell.invoke.bind(shell);
      shell.invoke = async (command, args) => {
        const answer = await invoke(command, args);
        if (command === "fs_read" && args?.["path"] === "waiting.json" && !interrupted) {
          interrupted = true;
          await other.noteWaiting({ ...lookup, name: "search" }, waitingVersion(2));
        }
        return answer;
      };
      await store.approve(toolApproval());
      expect(interrupted).toBe(true);
      expect(files.get("waiting.json")).toContain("search");
      expect(files.get("waiting.json")).not.toContain("lookup");
    });

    it("keeps a waiting file that was rewritten between its read as damaged and its removal", async () => {
      const shell = openShell();
      const store = new TauriToolApprovalStore(shell);
      const files = shell.approvalsOf(workspace, "notes").files;
      await store.noteWaiting({ ...lookup, name: "search" }, waitingVersion(2));
      const rewritten = files.get("waiting.json");
      files.set("waiting.json", notText);
      let interrupted = false;
      const invoke = shell.invoke.bind(shell);
      shell.invoke = async (command, args) => {
        if (command !== "fs_remove" || args?.["path"] !== "waiting.json" || interrupted) {
          return await invoke(command, args);
        }
        interrupted = true;
        if (rewritten === undefined) throw new Error("There is nothing waiting.");
        files.set("waiting.json", rewritten);
        return await invoke(command, args);
      };
      await store.approve(toolApproval());
      expect(interrupted).toBe(true);
      expect(files.get("waiting.json")).toBe(rewritten);
    });

    it("removes a waiting file that isn't text when it approves", async () => {
      const shell = openShell();
      const store = new TauriToolApprovalStore(shell);
      const files = shell.approvalsOf(workspace, "notes").files;
      files.set("waiting.json", notText);
      await store.approve(toolApproval());
      expect(files.has("waiting.json")).toBe(false);
    });

    it("keeps the waiting file when the approved tool isn't in it", async () => {
      const shell = openShell();
      const store = new TauriToolApprovalStore(shell);
      await store.noteWaiting({ ...lookup, name: "search" }, waitingVersion(2));
      const before = shell.calls.filter((call) => call.command === "fs_write").length;
      await store.approve(toolApproval());
      const writes = shell.calls.filter((call) => call.command === "fs_write").length;
      expect(writes - before).toBe(1);
    });

    it("refuses a name that isn't the store's, a list of a folder, and a call without a source", async () => {
      const shell = openShell();
      const call = (args: Record<string, unknown>) =>
        shell.invoke("fs_write", {
          workspace,
          folder: "tool-approvals",
          text: "",
          expected: null,
          ...args,
        });
      await expect(call({ source: "notes", path: "lock" })).rejects.toMatchObject({
        kind: "unsafe_path",
      });
      await expect(call({ path: "waiting.json" })).rejects.toMatchObject({ kind: "unsafe_path" });
      await expect(
        shell.invoke("fs_list", { workspace, folder: "tool-approvals", source: "notes", dir: "x" }),
      ).rejects.toMatchObject({ kind: "unsafe_path" });
    });

    it("refuses an approval that isn't well formed, before the shell is called", async () => {
      const shell = openShell();
      const store = new TauriToolApprovalStore(shell);
      const bad = { ...toolApproval(), fingerprint: "nope" } as unknown as ReturnType<
        typeof toolApproval
      >;
      expect(await rejection(store.approve(bad))).toBeInstanceOf(RangeError);
      expect(shell.calls).toEqual([]);
    });
  });
});
