import { encodeBase64url, errorKindOf, KindedError } from "@halonicjs/std";
import { blobStoreContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type BlobRefusalKind, isBlobRefusal } from "./blob-commands.ts";
import { TauriBlobStore } from "./blob-store.ts";
import { FakeBlobShell } from "./fake-blob-shell.test-helper.ts";
import type { TauriShell } from "./shell.ts";

const acme = "/workspaces/acme";
const helloHash = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
const hello = new TextEncoder().encode("hello");

// The contract runs against the fake shell. That the shell keeps each blob
// as `FolderBlobStore` keeps it, refusing links, is proved on real files by
// the Rust tests of crates/blob-store.
blobStoreContract(
  "tauri",
  async () => new TauriBlobStore(new FakeBlobShell({ opened: [acme] }), acme),
);

/** The error a call rejects with. */
async function rejection(action: Promise<unknown>): Promise<unknown> {
  return action.then(
    () => expect.unreachable("the call should have failed"),
    (reason: unknown) => reason,
  );
}

/** A store whose shell answers every call with `answer`. */
function answering(answer: unknown): TauriBlobStore {
  const shell: TauriShell = { invoke: async () => answer };
  return new TauriBlobStore(shell, acme);
}

verifies("fs-tauri.runs-and-blobs-on-disk", () => {
  describe("TauriBlobStore", () => {
    it("names the workspace in every call, and sends the bytes as base64url", async () => {
      const shell = new FakeBlobShell({ opened: [acme] });
      const store = new TauriBlobStore(shell, acme);
      await store.put(hello, "text/plain");
      await store.get(helloHash);
      expect(shell.calls).toEqual([
        { command: "blob_put", args: { workspace: acme, data: encodeBase64url(hello) } },
        { command: "blob_get", args: { workspace: acme, hash: helloHash } },
      ]);
      expect([...shell.stored(acme).keys()]).toEqual([helloHash]);
    });

    it("keeps each workspace's blobs apart", async () => {
      const other = "/workspaces/other";
      const shell = new FakeBlobShell({ opened: [acme, other] });
      await new TauriBlobStore(shell, acme).put(hello, "text/plain");
      expect(await new TauriBlobStore(shell, other).get(helloHash)).toBeNull();
    });

    it("refuses a bad media type or hash before asking the shell", async () => {
      const shell = new FakeBlobShell({ opened: [acme] });
      const store = new TauriBlobStore(shell, acme);
      await expect(store.put(hello, "text/plain; charset=utf-8")).rejects.toThrow(RangeError);
      expect(await store.get("../secret")).toBeNull();
      expect(shell.calls).toEqual([]);
    });

    it("refuses a workspace the person didn't open in the shell as denied", async () => {
      const store = new TauriBlobStore(new FakeBlobShell({ opened: [] }), acme);
      expect(errorKindOf(await rejection(store.put(hello, "text/plain")))).toBe("denied");
      expect(errorKindOf(await rejection(store.get(helloHash)))).toBe("denied");
    });

    it("passes on a linked blob as a plain error with the shell's message", async () => {
      const shell = new FakeBlobShell({ opened: [acme] });
      shell.refuseNext("linked_blob");
      const error = await rejection(new TauriBlobStore(shell, acme).get(helloHash));
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(KindedError);
      expect(isBlobRefusal((error as Error).cause)).toBe(true);
      expect(String(error)).toContain("refused by the test (linked_blob)");
    });

    it("gives each other refusal its error kind", async () => {
      const expected: Record<Exclude<BlobRefusalKind, "linked_blob">, string> = {
        folder_not_open: "denied",
        invalid_hash: "internal",
        invalid_data: "internal",
        io: "unavailable",
      };
      for (const [refusal, kind] of Object.entries(expected)) {
        const shell = new FakeBlobShell({ opened: [acme] });
        shell.refuseNext(refusal as BlobRefusalKind);
        const error = await rejection(new TauriBlobStore(shell, acme).put(hello, "text/plain"));
        expect(errorKindOf(error), refusal).toBe(kind);
        expect(String(error), refusal).toContain(`refused by the test (${refusal})`);
      }
    });

    it("rejects as unavailable, without the shell's text, when the page has no blob capability", async () => {
      const store = new TauriBlobStore(new FakeBlobShell({ opened: [acme], granted: false }), acme);
      for (const call of [store.put(hello, "text/plain"), store.get(helloHash)]) {
        const error = await rejection(call);
        expect(errorKindOf(error)).toBe("unavailable");
        expect(String(error)).not.toContain("ACL");
      }
    });

    it("rejects an answer that isn't the command's as unavailable", async () => {
      for (const answer of [null, {}, { hash: 5 }, { hash: helloHash.toUpperCase() }]) {
        const error = await rejection(answering(answer).put(hello, "text/plain"));
        expect(errorKindOf(error), JSON.stringify(answer)).toBe("unavailable");
      }
      for (const answer of [5, "not base64url!", "-_9"]) {
        const error = await rejection(answering(answer).get(helloHash));
        expect(errorKindOf(error), JSON.stringify(answer)).toBe("unavailable");
      }
    });

    it("has a fake shell that refuses what the Rust shell refuses", async () => {
      const shell = new FakeBlobShell({ opened: [acme] });
      const refused = async (command: string, args: Record<string, unknown>) =>
        rejection(shell.invoke(command, { workspace: acme, ...args }));
      expect(await refused("blob_put", { data: "a+b" })).toMatchObject({ kind: "invalid_data" });
      expect(await refused("blob_get", { hash: "../secret" })).toMatchObject({
        kind: "invalid_hash",
      });
      expect(await refused("blob_list", {})).toBe("Command blob_list not found");
    });
  });
});
