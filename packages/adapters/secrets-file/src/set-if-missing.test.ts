import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { FileSecretStore } from "./file-secret-store.ts";

let folder: string;
let file: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-secrets-if-missing-"));
  file = join(folder, "secrets", "secrets.json");
});

afterEach(() => rm(folder, { recursive: true, force: true }));

verifies("secrets-file.set-if-missing", () => {
  it("stores the value in an empty profile and answers it", async () => {
    const store = new FileSecretStore(file);

    expect(await store.setIfMissing("token-key", "first-value")).toBe("first-value");
    expect(await store.get("token-key")).toBe("first-value");
  });

  it("keeps a stored value and answers it", async () => {
    const store = new FileSecretStore(file);
    await store.set("token-key", "kept-value");
    const before = await readFile(file, "utf8");

    expect(await store.setIfMissing("Token_Key", "other-value")).toBe("kept-value");
    expect(await readFile(file, "utf8")).toBe(before);
  });

  it("gives every caller the first value when several store one at once", async () => {
    // A store each, as separate programs have: only the file's write lock keeps them apart.
    const values = Array.from({ length: 10 }, (_, index) => `value-${index}`);

    const answers = await Promise.all(
      values.map((value) => new FileSecretStore(file).setIfMissing("token-key", value)),
    );

    const stored = await new FileSecretStore(file).get("token-key");
    expect(values).toContain(stored);
    expect(new Set(answers)).toEqual(new Set([stored]));
    expect(await readdir(join(folder, "secrets"))).toEqual(["secrets.json"]);
  });

  it("checks the name and the value as set does, without repeating the value", async () => {
    const store = new FileSecretStore(file);

    await expect(store.setIfMissing("not a name", "x")).rejects.toThrow(RangeError);
    const error = await store.setIfMissing("token-key", "").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RangeError);
    expect(await store.get("token-key")).toBeNull();
  });
});
