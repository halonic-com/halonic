import { link, open, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import { refuseUnlessPlain } from "./private-files.ts";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";

afterAll(removeTempFolders);

verifies("fs-node.trust-store-files", () => {
  describe("refuseUnlessPlain", () => {
    // A grant or revoke can remove the name between the reader's open and its
    // check of the open file, so the file it checks may have no name (HAL-3052).
    it("accepts an open file whose name was removed after it was opened", async () => {
      const file = join(await tempFolder(), "record.json");
      await writeFile(file, "{}", "utf8");
      const handle = await open(file, "r");
      try {
        await unlink(file);
        const entry = await handle.stat();

        expect(() => refuseUnlessPlain(file, entry)).not.toThrow();
      } finally {
        await handle.close();
      }
    });

    it("refuses a file with a second name", async () => {
      const root = await tempFolder();
      const file = join(root, "record.json");
      await writeFile(file, "{}", "utf8");
      await link(file, join(root, "other.json"));
      const handle = await open(file, "r");
      try {
        const entry = await handle.stat();

        expect(() => refuseUnlessPlain(file, entry)).toThrow("is a hard link");
      } finally {
        await handle.close();
      }
    });
  });
});
