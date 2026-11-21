import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import { FileSecretStore } from "./file-secret-store.ts";
import { isPermissionDenied, unreadableSecretsFileError } from "./unreadable-file-error.ts";

const made: string[] = [];

async function freshFile(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "halonic-secrets-"));
  made.push(folder);
  return join(folder, "secrets", "secrets.json");
}

afterAll(async () => {
  // A file with mode 000 is removed all the same: removing needs the folder's permission, not the file's.
  await Promise.all(made.map((folder) => rm(folder, { recursive: true, force: true })));
});

/** Mode `000` stops every user but root, so the store test needs Linux or macOS and no root. */
const deniable = process.platform !== "win32" && process.getuid?.() !== 0;

verifies("secrets-file.unreadable", () => {
  describe.skipIf(!deniable)("a secrets file the person can't read", () => {
    it("refuses every call with the cause and chmod 600, and doesn't change the file", async () => {
      const file = await freshFile();
      const store = new FileSecretStore(file);
      await store.set("openai-key", "sk-kept");
      await chmod(file, 0o000);
      for (const call of [
        () => store.get("openai-key"),
        () => store.names(),
        () => store.set("openai-key", "sk-new"),
        () => store.remove("openai-key"),
      ]) {
        await expect(call()).rejects.toMatchObject({
          kind: "denied",
          message: `The secrets file ${file} can't be read by you.`,
          fix: `Run chmod 600 ${file}, then run again.`,
          cause: { code: "EACCES" },
        });
      }
      await chmod(file, 0o600);
      expect(await store.get("openai-key")).toBe("sk-kept");
    });
  });

  describe("the fix", () => {
    const file = "/srv/acme/secrets/secrets.json";

    it("is sudo chown, then chmod 600, for a file another user owns", () => {
      const error = unreadableSecretsFileError({ file, ownerId: 0, userId: 501 }, undefined);
      expect(error.fix).toBe(
        `It belongs to another user: run sudo chown "$(id -un)" ${file}, then chmod 600 ${file}, then run again.`,
      );
    });

    it("writes a file with a space in double quotes", () => {
      const spaced = "/srv/acme/Application Support/secrets/secrets.json";
      const error = unreadableSecretsFileError(
        { file: spaced, ownerId: 501, userId: 501 },
        undefined,
      );
      expect(error.fix).toBe(`Run chmod 600 "${spaced}", then run again.`);
    });

    it("names the file's Properties on Windows, which has no chmod", () => {
      const error = unreadableSecretsFileError({ file, ownerId: 0, userId: undefined }, undefined);
      expect(error.fix).toBe(
        "Give your user account access to it in the file's Properties, under Security, then run again.",
      );
    });

    it("keeps the file system's error as the cause, for --debug", () => {
      const cause = Object.assign(new Error("EACCES"), { code: "EACCES" });
      expect(unreadableSecretsFileError({ file, ownerId: 1, userId: 1 }, cause).cause).toBe(cause);
    });
  });

  it("takes EACCES and EPERM as permission denied, and nothing else", () => {
    expect(isPermissionDenied({ code: "EACCES" })).toBe(true);
    expect(isPermissionDenied({ code: "EPERM" })).toBe(true);
    expect(isPermissionDenied({ code: "ENOENT" })).toBe(false);
    expect(isPermissionDenied(null)).toBe(false);
  });
});
