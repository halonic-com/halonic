import { createHash } from "node:crypto";
import { chmod, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { trustRecord, trustStoreContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";
import { FileTrustStore } from "./trust-store.ts";

afterAll(removeTempFolders);

/** The file `FileTrustStore` keeps the record for `location` in. */
function fileFor(root: string, location: string): string {
  return join(root, `${createHash("sha256").update(location, "utf16le").digest("hex")}.json`);
}

trustStoreContract("file", async () => {
  const root = await tempFolder();
  return {
    store: new FileTrustStore(root),
    // Cut the file in half, as a crash or a full disk would. The contract's
    // locations are short, so the location line always survives; the tests
    // below cover a file whose location can't be read.
    damage: async (location) => {
      const file = fileFor(root, location);
      const text = await readFile(file, "utf8");
      await writeFile(file, text.slice(0, text.length / 2), "utf8");
    },
  };
});

verifies("fs-node.trust-store-files", () => {
  describe("the files", () => {
    it("keeps each record in a file named by the hash of its location, location first", async () => {
      const root = await tempFolder();
      await new FileTrustStore(join(root, "trust")).grant(trustRecord("/Workspaces/Café"));

      const file = fileFor(join(root, "trust"), "/Workspaces/Café");
      const text = await readFile(file, "utf8");
      expect(text.startsWith('{\n  "location": "/Workspaces/Café",')).toBe(true);
      expect(JSON.parse(text)).toEqual(trustRecord("/Workspaces/Café"));
      expect(await readdir(join(root, "trust"))).toEqual([file.slice(-69)]);
    });

    it("keeps locations with different lone surrogates in different files", async () => {
      const root = await tempFolder();
      const store = new FileTrustStore(root);
      await store.grant(trustRecord("/a\uD800"));
      await store.grant(trustRecord("/a\uD801"));

      expect(await readdir(root)).toHaveLength(2);
      expect(await store.get("/a\uD800")).toEqual(trustRecord("/a\uD800"));
      expect(await store.get("/a\uD801")).toEqual(trustRecord("/a\uD801"));
      expect(await store.list()).toEqual([trustRecord("/a\uD800"), trustRecord("/a\uD801")]);
    });

    it.skipIf(process.platform === "win32")(
      "makes the folder and the files private to the user",
      async () => {
        const root = join(await tempFolder(), "trust");
        await new FileTrustStore(root).grant(trustRecord("/workspaces/acme"));
        expect((await stat(root)).mode & 0o777).toBe(0o700);
        expect((await stat(fileFor(root, "/workspaces/acme"))).mode & 0o777).toBe(0o600);
      },
    );

    it("reads a folder that isn't there yet as empty", async () => {
      const store = new FileTrustStore(join(await tempFolder(), "trust"));
      expect(await store.get("/workspaces/acme")).toBeNull();
      expect(await store.list()).toEqual([]);
      await store.revoke("/workspaces/acme");
    });

    it("lists only record files, and leaves other files alone", async () => {
      const root = await tempFolder();
      const store = new FileTrustStore(root);
      await store.grant(trustRecord("/workspaces/acme"));
      await writeFile(join(root, "notes.txt"), "mine", "utf8");
      await writeFile(`${fileFor(root, "/workspaces/zeta")}.0f1e.tmp`, "{", "utf8");

      expect(await store.list()).toEqual([trustRecord("/workspaces/acme")]);
      expect(await readFile(join(root, "notes.txt"), "utf8")).toBe("mine");
    });
  });

  describe("a record that can't be read", () => {
    it("names the file when not even its location can be read, and revoke still deletes it", async () => {
      const root = await tempFolder();
      const store = new FileTrustStore(root);
      await store.grant(trustRecord("/workspaces/acme"));
      const file = fileFor(root, "/workspaces/acme");
      await writeFile(file, "{", "utf8");

      await expect(store.get("/workspaces/acme")).rejects.toThrow('"/workspaces/acme"');
      await expect(store.list()).rejects.toThrow(JSON.stringify(file));
      await store.revoke("/workspaces/acme");
      expect(await store.list()).toEqual([]);
    });

    it("doesn't believe a location that isn't the one the file is named for", async () => {
      const root = await tempFolder();
      const store = new FileTrustStore(root);
      await store.grant(trustRecord("/workspaces/acme"));
      // A record copied over another location's file.
      await writeFile(
        fileFor(root, "/workspaces/zeta"),
        await readFile(fileFor(root, "/workspaces/acme"), "utf8"),
        "utf8",
      );

      await expect(store.get("/workspaces/zeta")).rejects.toThrow('"/workspaces/zeta"');
      await expect(store.list()).rejects.toThrow(JSON.stringify(fileFor(root, "/workspaces/zeta")));
      expect(await store.get("/workspaces/acme")).toEqual(trustRecord("/workspaces/acme"));
    });

    it.each([
      ["JSON that isn't an object", "null"],
      ["a location with a broken escape", '{"location": "/workspaces/\\u12"}'],
    ])("can't be read when the file holds %s", async (_kind, text) => {
      const root = await tempFolder();
      const store = new FileTrustStore(root);
      await writeFile(fileFor(root, "/workspaces/acme"), text, "utf8");

      await expect(store.get("/workspaces/acme")).rejects.toThrow('"/workspaces/acme"');
      await expect(store.list()).rejects.toThrow("can't be read");
    });
  });

  describe("a file system error", () => {
    it("names the location or the file when a record is a folder", async () => {
      const root = await tempFolder();
      const store = new FileTrustStore(root);
      const file = fileFor(root, "/workspaces/acme");
      await mkdir(join(file, "inside"), { recursive: true });

      await expect(store.get("/workspaces/acme")).rejects.toThrow('"/workspaces/acme"');
      await expect(store.list()).rejects.toThrow(JSON.stringify(file));
    });

    it("leaves no temporary file behind when a grant fails", async () => {
      const root = await tempFolder();
      const store = new FileTrustStore(root);
      // A folder with something in it can't be renamed over.
      await mkdir(join(fileFor(root, "/workspaces/acme"), "inside"), { recursive: true });

      await expect(store.grant(trustRecord("/workspaces/acme"))).rejects.toThrow();
      expect((await readdir(root)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    });

    it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
      "passes on an error reading the folder",
      async () => {
        const root = await tempFolder();
        const store = new FileTrustStore(root);
        await store.grant(trustRecord("/workspaces/acme"));
        await chmod(root, 0o000);
        try {
          await expect(store.list()).rejects.toThrow("EACCES");
        } finally {
          await chmod(root, 0o700);
        }
      },
    );
  });
});
