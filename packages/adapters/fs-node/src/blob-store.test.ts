import { link, mkdir, readdir, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { blobStoreContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import { blobFile, FolderBlobStore } from "./blob-store.ts";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";

afterAll(removeTempFolders);

blobStoreContract("folder", async () => new FolderBlobStore(join(await tempFolder(), "blobs")));

/** SHA-256 of "hello". */
const helloHash = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
const hello = new TextEncoder().encode("hello");
/** Windows has no file modes, and a symbolic link there needs a privilege a test can't count on. */
const unix = process.platform !== "win32";

verifies("fs-node.blob-store-files", () => {
  describe("the files", () => {
    it("keeps a blob in a file named by its hash, in a folder named by its first two characters", async () => {
      const root = join(await tempFolder(), "blobs");
      await new FolderBlobStore(root).put(hello, "text/plain");

      expect(await readdir(root)).toEqual(["2c"]);
      expect(await readdir(join(root, "2c"))).toEqual([helloHash]);
      expect(await readFile(join(root, "2c", helloHash), "utf8")).toBe("hello");
    });

    it.runIf(unix)(
      "[platform:win32] needs POSIX links, modes and signals: makes the folders private and the file readable only by the user",
      async () => {
        const root = join(await tempFolder(), "blobs");
        await new FolderBlobStore(root).put(hello, "text/plain");

        expect((await stat(root)).mode & 0o777).toBe(0o700);
        expect((await stat(join(root, "2c"))).mode & 0o777).toBe(0o700);
        expect((await stat(join(root, "2c", helloHash))).mode & 0o777).toBe(0o600);
      },
    );

    it("reads a folder that doesn't exist yet as empty", async () => {
      const store = new FolderBlobStore(join(await tempFolder(), "blobs"));
      expect(await store.get(helloHash)).toBeNull();
    });

    it("leaves no temporary file behind", async () => {
      const root = join(await tempFolder(), "blobs");
      const store = new FolderBlobStore(root);
      await Promise.all([store.put(hello, "text/plain"), store.put(hello, "text/markdown")]);

      expect(await readdir(join(root, "2c"))).toEqual([helloHash]);
    });

    it("writes nothing when the bytes are already stored", async () => {
      const root = join(await tempFolder(), "blobs");
      const store = new FolderBlobStore(root);
      await store.put(hello, "text/plain");
      const before = await stat(join(root, "2c", helloHash));

      await store.put(hello, "text/plain");

      expect((await stat(join(root, "2c", helloHash))).ino).toBe(before.ino);
    });

    it("stores the bytes as they were when put, even from a Buffer changed while the put waits", async () => {
      const root = join(await tempFolder(), "blobs");
      const store = new FolderBlobStore(root);
      // `Buffer.slice` returns a view, not a copy (Tomas, HAL-3912).
      const data = Buffer.from("hello");

      const putting = store.put(data, "text/plain");
      data[0] = "H".charCodeAt(0);
      const ref = await putting;

      expect(ref.hash).toBe(helloHash);
      expect(await store.get(helloHash)).toEqual(hello);
    });
  });

  describe("the folder's edges", () => {
    it("never reads outside its folder for a hash that walks out", async () => {
      const outside = await tempFolder();
      const root = join(outside, "blobs");
      // What `<root>/../<name>` would read, if the hash ever reached a path.
      await writeFile(join(outside, "secret"), "not a blob", "utf8");
      const store = new FolderBlobStore(root);

      for (const hash of ["../secret", `../${"0".repeat(61)}`, join(outside, "secret")]) {
        expect(await store.get(hash), hash).toBeNull();
      }
    });

    it("builds no path outside the folder", () => {
      const root = join("profile", "blobs");
      expect(blobFile(root, helloHash)).toMatch(/2c[/\\]2cf24dba/u);
      for (const hash of ["", "..", "../..", "../../secret"]) {
        expect(() => blobFile(root, hash), hash).toThrow(RangeError);
      }
    });

    it.runIf(unix)(
      "[platform:win32] needs POSIX links, modes and signals: refuses to read a link, and a put replaces it",
      async () => {
        const outside = await tempFolder();
        const root = join(outside, "blobs");
        await writeFile(join(outside, "elsewhere"), "hello", "utf8");
        await mkdir(join(root, "2c"), { recursive: true });
        await symlink(join(outside, "elsewhere"), join(root, "2c", helloHash));
        const store = new FolderBlobStore(root);

        await expect(store.get(helloHash)).rejects.toThrow(RangeError);
        await store.put(hello, "text/plain");

        expect(await store.get(helloHash)).toEqual(hello);
        expect(await readFile(join(outside, "elsewhere"), "utf8")).toBe("hello");
      },
    );

    it("refuses to read a hard link, and a put replaces it", async () => {
      const outside = await tempFolder();
      const root = join(outside, "blobs");
      await writeFile(join(outside, "elsewhere"), "hello", "utf8");
      await mkdir(join(root, "2c"), { recursive: true });
      await link(join(outside, "elsewhere"), join(root, "2c", helloHash));
      const store = new FolderBlobStore(root);

      await expect(store.get(helloHash)).rejects.toThrow(RangeError);
      await store.put(hello, "text/plain");

      expect(await store.get(helloHash)).toEqual(hello);
      expect((await stat(join(outside, "elsewhere"))).nlink).toBe(1);
    });

    it.runIf(unix)(
      "[platform:win32] needs POSIX links, modes and signals: refuses to put through a link in place of a blob's folder",
      async () => {
        const outside = await tempFolder();
        const root = join(outside, "blobs");
        await mkdir(join(outside, "elsewhere"), { mode: 0o755 });
        await mkdir(root);
        await symlink(join(outside, "elsewhere"), join(root, "2c"));
        const store = new FolderBlobStore(root);

        await expect(store.put(hello, "text/plain")).rejects.toThrow(RangeError);

        expect(await readdir(join(outside, "elsewhere"))).toEqual([]);
        expect((await stat(join(outside, "elsewhere"))).mode & 0o777).toBe(0o755);
      },
    );
  });
});
