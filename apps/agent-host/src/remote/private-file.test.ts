import { mkdtemp, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { privateFileAt } from "./private-file.ts";

verifies("agent-host.remote-paired-phones", () => {
  describe("privateFileAt", () => {
    let folder: string;

    beforeEach(async () => {
      folder = await mkdtemp(join(tmpdir(), "halonic-remote-"));
    });

    afterEach(async () => {
      await rm(folder, { recursive: true, force: true });
    });

    it("reads nothing before the first write, then what was written", async () => {
      const file = privateFileAt(join(folder, "remote", "phones.json"));
      expect(await file.read()).toBeUndefined();
      await file.write("one\n");
      await file.write("two\n");
      expect(await file.read()).toBe("two\n");
    });

    it.skipIf(process.platform === "win32")("keeps the file and its folder private", async () => {
      const path = join(folder, "remote", "phones.json");
      await privateFileAt(path).write("{}\n");
      expect((await stat(path)).mode & 0o777).toBe(0o600);
      expect((await stat(join(folder, "remote"))).mode & 0o777).toBe(0o700);
    });

    it.skipIf(process.platform === "win32")("refuses a link in the file's place", async () => {
      const elsewhere = join(folder, "elsewhere.json");
      await writeFile(elsewhere, "{}\n");
      const path = join(folder, "phones.json");
      await symlink(elsewhere, path);
      await expect(privateFileAt(path).read()).rejects.toThrow();
    });
  });
});
