import { randomUUID } from "node:crypto";
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { secretStoreContract, secretsContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import { FileSecretStore } from "./file-secret-store.ts";

const made: string[] = [];

async function freshFile(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "halonic-secrets-"));
  made.push(folder);
  return join(folder, "secrets", "secrets.json");
}

afterAll(async () => {
  await Promise.all(made.map((folder) => rm(folder, { recursive: true, force: true })));
});

let lastFile = "";
secretStoreContract("file", {
  make: async () => {
    lastFile = await freshFile();
    return new FileSecretStore(lastFile);
  },
  reopen: async () => new FileSecretStore(lastFile),
});

secretsContract("file", async (values) => {
  const store = new FileSecretStore(await freshFile());
  for (const [name, value] of Object.entries(values)) {
    await store.set(name, value);
  }
  return store;
});

const posix = process.platform === "win32" ? describe.skip : describe;

verifies("secrets-file.store", () => {
  it("writes the version, the key and the name as last written", async () => {
    const file = await freshFile();
    await new FileSecretStore(file).set("openai-key", "sk-test");
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
      version: 1,
      secrets: { OPENAI_KEY: { name: "openai-key", value: "sk-test" } },
    });
  });

  it("reads the file at every call, so a change by another program is found at once", async () => {
    const file = await freshFile();
    const one = new FileSecretStore(file);
    const two = new FileSecretStore(file);
    await one.set("openai-key", "first");
    expect(await two.get("openai-key")).toBe("first");
    await two.set("openai-key", "second");
    expect(await one.get("openai-key")).toBe("second");
  });

  it("keeps every secret of twenty saves at once and leaves no temporary file", async () => {
    const file = await freshFile();
    const store = new FileSecretStore(file);
    const names = Array.from({ length: 20 }, (_, index) => `secret-${index}`);
    await Promise.all(names.map((name) => store.set(name, `value-${name}`)));
    expect(await store.names()).toHaveLength(20);
    expect(await readdir(join(file, ".."))).toEqual(["secrets.json"]);
  });

  it("goes on after a save failed", async () => {
    const file = await freshFile();
    const store = new FileSecretStore(file);
    await mkdir(join(file, "..", "secrets.json"), { recursive: true });
    await expect(store.set("a", "x")).rejects.toThrow();
    await rm(file, { recursive: true });
    await store.set("a", "x");
    expect(await store.get("a")).toBe("x");
    expect(await readdir(join(file, ".."))).toEqual(["secrets.json"]);
  });

  it("doesn't write when removing a secret that isn't there", async () => {
    const file = await freshFile();
    const store = new FileSecretStore(file);
    await store.remove("nothing");
    await expect(lstat(file)).rejects.toThrow();
  });

  describe("a file it doesn't understand", () => {
    const refused = [
      ["not JSON", "{nope"],
      ["not an object", "[]"],
      ["no secrets", '{"version":1}'],
      ["secrets that are a list", '{"version":1,"secrets":[]}'],
      ["an entry that isn't one", '{"version":1,"secrets":{"A":"x"}}'],
      ["an entry without a value", '{"version":1,"secrets":{"A":{"name":"a"}}}'],
      ["an empty value", '{"version":1,"secrets":{"A":{"name":"a","value":""}}}'],
      [
        "an over-long value",
        `{"version":1,"secrets":{"A":{"name":"a","value":"${"x".repeat(70_000)}"}}}`,
      ],
      ["a key that isn't its name's", '{"version":1,"secrets":{"A":{"name":"b","value":"x"}}}'],
      ["a bad name", '{"version":1,"secrets":{"A B":{"name":"a b","value":"x"}}}'],
    ] as const;

    it.each(refused)("refuses %s and doesn't save over it", async (_label, text) => {
      const file = await freshFile();
      await mkdir(join(file, ".."), { recursive: true, mode: 0o700 });
      await writeFile(file, text, { mode: 0o600 });
      const store = new FileSecretStore(file);
      for (const call of [
        () => store.get("a"),
        () => store.names(),
        () => store.set("a", "new"),
        () => store.remove("a"),
      ]) {
        await expect(call()).rejects.toMatchObject({
          kind: "unavailable",
          fix: "Restore it from a backup, or remove it and set the secrets again.",
        });
      }
      expect(await readFile(file, "utf8")).toBe(text);
    });

    it("refuses a version it doesn't know, with its own fix", async () => {
      const file = await freshFile();
      await mkdir(join(file, ".."), { recursive: true, mode: 0o700 });
      await writeFile(file, '{"version":2,"secrets":{}}', { mode: 0o600 });
      await expect(new FileSecretStore(file).get("a")).rejects.toMatchObject({
        kind: "unavailable",
        fix: "Update Halonic, then run again.",
      });
    });
  });
});

verifies("secrets-file.private", () => {
  posix("on Linux and macOS", () => {
    it("makes the folder 0700 and the file 0600", async () => {
      const file = await freshFile();
      await new FileSecretStore(file).set("openai-key", "sk-test");
      expect((await lstat(join(file, ".."))).mode & 0o777).toBe(0o700);
      expect((await lstat(file)).mode & 0o777).toBe(0o600);
    });

    it("makes a folder someone else made private, too", async () => {
      const file = await freshFile();
      await mkdir(join(file, ".."), { recursive: true, mode: 0o755 });
      await new FileSecretStore(file).set("openai-key", "sk-test");
      expect((await lstat(join(file, ".."))).mode & 0o777).toBe(0o700);
    });

    it.each([0o640, 0o604, 0o644, 0o660, 0o666])(
      "refuses a file with mode %o, naming the fix, and doesn't change it",
      async (mode) => {
        const file = await freshFile();
        const store = new FileSecretStore(file);
        await store.set("openai-key", "sk-kept");
        await chmod(file, mode);
        const before = await readFile(file, "utf8");
        for (const call of [
          () => store.get("openai-key"),
          () => store.names(),
          () => store.set("openai-key", "sk-new"),
          () => store.remove("openai-key"),
        ]) {
          const error = await call().then(
            () => undefined,
            (reason: unknown) => reason as { kind: string; fix: string; message: string },
          );
          expect(error?.kind).toBe("denied");
          expect(error?.fix).toBe(`Run chmod 600 ${file}, then run again.`);
          expect(error?.message).not.toContain("sk-");
        }
        expect(await readFile(file, "utf8")).toBe(before);
      },
    );

    it("reads a file with mode 0400 and 0600", async () => {
      const file = await freshFile();
      const store = new FileSecretStore(file);
      await store.set("openai-key", "sk-test");
      await chmod(file, 0o400);
      expect(await store.get("openai-key")).toBe("sk-test");
    });

    it("refuses a link in the file's place, and leaves what it points to alone", async () => {
      const file = await freshFile();
      const target = join(file, "..", "..", `elsewhere-${randomUUID()}.json`);
      await mkdir(join(file, ".."), { recursive: true, mode: 0o700 });
      await writeFile(target, '{"version":1,"secrets":{}}', { mode: 0o600 });
      await symlink(target, file);
      const store = new FileSecretStore(file);
      await expect(store.get("a")).rejects.toThrow(RangeError);
      await expect(store.set("a", "x")).rejects.toThrow(RangeError);
      expect(await readFile(target, "utf8")).toBe('{"version":1,"secrets":{}}');
    });

    it("refuses a file with a second name", async () => {
      const file = await freshFile();
      const store = new FileSecretStore(file);
      await store.set("openai-key", "sk-test");
      await link(file, join(file, "..", "second-name.json"));
      await expect(store.get("openai-key")).rejects.toThrow(RangeError);
    });
  });
});

verifies("secrets-file.value-never-shown", () => {
  async function failure(file: string, call: (store: FileSecretStore) => Promise<unknown>) {
    return await call(new FileSecretStore(file)).then(
      () => undefined,
      (reason: unknown) => reason as Error & { fix?: string; cause?: unknown },
    );
  }

  it("never quotes a damaged file's content, in the message, the fix or a cause", async () => {
    const file = await freshFile();
    await mkdir(join(file, ".."), { recursive: true, mode: 0o700 });
    for (const text of [
      '{"version":1,"secrets":{"A":{"name":"a","value":"sk-live-leak',
      '{"version":1,"secrets":{"A":{"name":"a","value":"sk-live-leak","extra":}}}',
      '{"version":1,"secrets":{"A":{"name":"a","value":"sk-live-leak","x":1}},"sk-live-leak":[}',
      '{"version":1,"secrets":{"A":{"name":"b","value":"sk-live-leak"}}}',
      '{"version":1,"secrets":{"A":{"name":"a","value":["sk-live-leak"]}}}',
    ]) {
      await writeFile(file, text, { mode: 0o600 });
      const error = await failure(file, (store) => store.get("a"));
      expect(error).toBeInstanceOf(Error);
      expect(JSON.stringify([error?.message, error?.fix, error?.cause])).not.toContain("leak");
      expect(error?.cause).toBeUndefined();
    }
  });

  it("never holds the value when a save fails", async () => {
    const file = await freshFile();
    await mkdir(join(file, ".."), { recursive: true, mode: 0o700 });
    await mkdir(file);
    const error = await failure(file, (store) => store.set("openai-key", "sk-live-leak"));
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).not.toContain("sk-live-leak");
  });

  it("lists names only", async () => {
    const store = new FileSecretStore(await freshFile());
    await store.set("one", "sk-live-leak-1");
    await store.set("two", "sk-live-leak-2");
    expect(JSON.stringify(await store.names())).not.toContain("leak");
  });
});
