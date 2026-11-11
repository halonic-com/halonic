import { contentDigest, errorKindOf, type Sha256 } from "@halonicjs/std";
import { definitionStoreContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { BrowserFolderDefinitionStore } from "./definition-store.ts";
import { FakeDisk } from "./fake-folder.test-helper.ts";
import { FolderAccessError, isFolderAccessError } from "./folder-access.ts";

const webCryptoDigest: Sha256 = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

definitionStoreContract("browser folder", async (files) => {
  return new BrowserFolderDefinitionStore(new FakeDisk(files).root);
});

/** A store over a fake folder holding `files`, and the fake's disk. */
function opened(files: Record<string, string>, options?: { permissionCalls?: boolean }) {
  const disk = new FakeDisk(files, options);
  return { disk, store: new BrowserFolderDefinitionStore(disk.root) };
}

verifies("fs-web.open-local-folder", () => {
  describe("BrowserFolderDefinitionStore", () => {
    it("names the folder it was given as its location", () => {
      expect(opened({}).store.location).toBe("browser:acme");
    });

    it("leaves the browser's pending copies out, while a write is pending too", async () => {
      const { disk, store } = opened({ "a.yaml": "1" });
      let listedMeanwhile: string[] = [];
      disk.onWriteOpened = async () => {
        listedMeanwhile = await store.list();
      };
      await store.write("hubs/b.yaml", "2");
      expect(listedMeanwhile).toEqual(["a.yaml", "hubs/b.yaml"]);
      expect(await store.list()).toEqual(["a.yaml", "hubs/b.yaml"]);
    });

    it("never lets a reader see the new text before the write lands", async () => {
      const { disk, store } = opened({ "a.yaml": "1" });
      let readMeanwhile: string | null = null;
      disk.onWriteOpened = async () => {
        readMeanwhile = await store.read("a.yaml");
      };
      await store.write("a.yaml", "2");
      expect(readMeanwhile).toBe("1");
      expect(await store.read("a.yaml")).toBe("2");
    });

    it("refuses to write where a folder is, and changes nothing", async () => {
      const { store } = opened({ "hubs/a/hub.yaml": "id: a\n" });
      await expect(store.write("hubs/a", "x")).rejects.toThrow(
        expect.objectContaining({ name: "TypeMismatchError" }),
      );
      await store.remove("hubs/a");
      expect(await store.list()).toEqual(["hubs/a/hub.yaml"]);
    });

    it("refuses to make a folder where a file is", async () => {
      const { store } = opened({ "a.yaml": "1" });
      await expect(store.write("a.yaml/b.yaml", "x")).rejects.toThrow(
        expect.objectContaining({ name: "TypeMismatchError" }),
      );
      expect(await store.read("a.yaml")).toBe("1");
    });

    it("treats a file removed by another program as gone", async () => {
      const { disk, store } = opened({ "a.yaml": "1" });
      disk.removeOutside("a.yaml");
      expect(await store.read("a.yaml")).toBeNull();
      await store.remove("a.yaml");
      expect(await store.list()).toEqual([]);
    });
  });
});

verifies("fs-web.open-local-folder", () => {
  describe("BrowserFolderDefinitionStore when the browser fails a call", () => {
    it("reads a file removed between finding and reading it as gone", async () => {
      const { disk, store } = opened({ "a.yaml": "1" });
      disk.failOnce("getFile", "a.yaml", "NotFoundError");
      expect(await store.read("a.yaml")).toBeNull();
    });

    it("lets any other failure to read go on", async () => {
      const { disk, store } = opened({ "a.yaml": "1" });
      disk.failOnce("getFile", "a.yaml", "NotReadableError");
      await expect(store.read("a.yaml")).rejects.toMatchObject({ name: "NotReadableError" });
    });

    it("drops the pending copy of a write that fails, and keeps the old text", async () => {
      const { disk, store } = opened({ "a.yaml": "1" });
      disk.failOnce("write", "a.yaml", "QuotaExceededError");
      await expect(store.write("a.yaml", "2")).rejects.toMatchObject({
        name: "QuotaExceededError",
      });
      expect(await store.read("a.yaml")).toBe("1");
      expect(await store.list()).toEqual(["a.yaml"]);
    });

    it("removes a file another program removed in the meantime without an error", async () => {
      const { disk, store } = opened({ "a.yaml": "1" });
      disk.failOnce("removeEntry", "a.yaml", "NotFoundError");
      await store.remove("a.yaml");
      disk.failOnce("removeEntry", "a.yaml", "InvalidModificationError");
      await expect(store.remove("a.yaml")).rejects.toMatchObject({
        name: "InvalidModificationError",
      });
    });

    it("lists nothing under a folder removed while it is listed", async () => {
      const { disk, store } = opened({ "a.yaml": "1", "hubs/b.yaml": "1" });
      disk.failOnce("values", "hubs", "NotFoundError");
      expect(await store.list()).toEqual(["a.yaml"]);
    });
  });
});

verifies("ports.definition-store-write-if-unchanged", () => {
  describe("BrowserFolderDefinitionStore while a write is pending", () => {
    it("doesn't write over a change from outside made after the first check", async () => {
      const { disk, store } = opened({ "a.yaml": "1" });
      disk.onWriteOpened = async () => {
        disk.writeOutside("a.yaml", "3");
      };
      const expected = await contentDigest("1", webCryptoDigest);
      expect(await store.write("a.yaml", "2", { expected })).toEqual({
        status: "changed-on-disk",
        current: "3",
      });
      expect(await store.read("a.yaml")).toBe("3");
      expect(await store.list()).toEqual(["a.yaml"]);
    });

    it("creates a file expected to be absent, unless another program made it meanwhile", async () => {
      const { disk, store } = opened({});
      expect(await store.write("a.yaml", "1", { expected: "absent" })).toEqual({
        status: "written",
      });
      disk.onWriteOpened = async () => {
        disk.writeOutside("b.yaml", "theirs");
      };
      expect(await store.write("b.yaml", "ours", { expected: "absent" })).toEqual({
        status: "changed-on-disk",
        current: "theirs",
      });
      expect(await store.read("b.yaml")).toBe("theirs");
    });
  });
});

verifies("fs-web.folder-access", () => {
  describe("BrowserFolderDefinitionStore without access", () => {
    it.each(["prompt", "denied"] as const)(
      "refuses every call with a FolderAccessError when the browser answers %s",
      async (state) => {
        const { disk, store } = opened({ "a.yaml": "1" });
        disk.access = state;
        const calls: (() => Promise<unknown>)[] = [
          () => store.list(),
          () => store.read("a.yaml"),
          () => store.write("a.yaml", "2"),
          () => store.remove("a.yaml"),
          () => store.version(),
          () => store.watch({ changed: () => {}, failed: () => {} }),
        ];
        for (const call of calls) {
          const error = await call().then(
            () => null,
            (reason: unknown) => reason,
          );
          expect(isFolderAccessError(error)).toBe(true);
          expect(error).toMatchObject({ state, kind: "denied" });
          expect(errorKindOf(error)).toBe("denied");
        }
        disk.access = "granted";
        expect(await store.read("a.yaml")).toBe("1");
      },
    );

    it("turns the browser's refusal of a call into a FolderAccessError", async () => {
      const { disk, store } = opened({ "a.yaml": "1" });
      disk.refuseCalls = true;
      const error = await store.read("a.yaml").catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(FolderAccessError);
      expect(error).toMatchObject({ state: "denied" });
      expect((error as Error).cause).toMatchObject({ name: "NotAllowedError" });
    });

    it("asks for access again only when told to, and says whether it came back", async () => {
      const { disk, store } = opened({ "a.yaml": "1" });
      disk.access = "prompt";
      disk.answerToRequest = "denied";
      expect(await store.requestAccess()).toBe(false);
      disk.answerToRequest = "granted";
      expect(await store.requestAccess()).toBe(true);
      expect(await store.read("a.yaml")).toBe("1");
    });

    it("works in a browser without the permission calls", async () => {
      const { store } = opened({ "a.yaml": "1" }, { permissionCalls: false });
      expect(await store.read("a.yaml")).toBe("1");
      expect(await store.requestAccess()).toBe(true);
    });

    it("tells a FolderAccessError from other errors, across copies of the package", () => {
      const copy = Object.assign(new Error("x"), { name: "FolderAccessError", state: "prompt" });
      expect(isFolderAccessError(copy)).toBe(true);
      expect(isFolderAccessError(new FolderAccessError("denied"))).toBe(true);
      expect(
        isFolderAccessError(Object.assign(new Error("x"), { name: "FolderAccessError" })),
      ).toBe(false);
      expect(isFolderAccessError(new Error("x"))).toBe(false);
      expect(isFolderAccessError({ name: "FolderAccessError", state: "denied" })).toBe(false);
    });

    it("says how to get access back", () => {
      expect(new FolderAccessError("prompt").fix).toBe("Allow access to the folder again.");
      expect(new FolderAccessError("denied").fix).toMatch(/site settings/u);
    });
  });
});
