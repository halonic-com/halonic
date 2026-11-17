import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, expect, it } from "vitest";
import { FileSecretStore } from "./file-secret-store.ts";

const made: string[] = [];

async function freshFile(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "halonic-secrets-origin-"));
  made.push(folder);
  return join(folder, "secrets", "secrets.json");
}

afterAll(async () => {
  await Promise.all(made.map((folder) => rm(folder, { recursive: true, force: true })));
});

const gateway = "https://gateway.example.com";

/** The gateway's address with a user name and password, built here so no source line holds one. */
function withUserInfo(username: string, password: string): string {
  const url = new URL(gateway);
  url.username = username;
  url.password = password;
  return url.href;
}

verifies("secrets-file.add-allowed-origin", () => {
  it("adds the origin of an address to a key with no list", async () => {
    const store = new FileSecretStore(await freshFile());
    await store.set("openai-key", "sk-test");

    const outcome = await store.addAllowedOrigin("openai-key", `${gateway}/v1?x=1`);

    expect(outcome).toEqual({ result: "added", origin: gateway });
    expect(await store.allowedOrigins("openai-key")).toEqual([gateway]);
  });

  it("keeps the origins the key already has, and leaves other keys alone", async () => {
    const store = new FileSecretStore(await freshFile());
    await store.set("openai-key", "sk-test");
    await store.set("other-key", "sk-other");
    await store.setAllowedOrigins("openai-key", ["https://api.example.com"]);

    await store.addAllowedOrigin("openai-key", gateway);

    expect(await store.allowedOrigins("openai-key")).toEqual(["https://api.example.com", gateway]);
    expect(await store.allowedOrigins("other-key")).toBeUndefined();
  });

  it("answers already-allowed and writes nothing for an origin on the list", async () => {
    const file = await freshFile();
    const store = new FileSecretStore(file);
    await store.set("openai-key", "sk-test");
    await store.addAllowedOrigin("openai-key", gateway);
    const before = await readFile(file, "utf8");

    const outcome = await store.addAllowedOrigin("openai-key", `${gateway}/other`);

    expect(outcome).toEqual({ result: "already-allowed", origin: gateway });
    expect(await readFile(file, "utf8")).toBe(before);
  });

  it("keeps both origins when two are added at once", async () => {
    const store = new FileSecretStore(await freshFile());
    await store.set("openai-key", "sk-test");

    await Promise.all([
      store.addAllowedOrigin("openai-key", "https://one.example.com"),
      store.addAllowedOrigin("openai-key", "https://two.example.com"),
    ]);

    expect(await store.allowedOrigins("openai-key")).toHaveLength(2);
  });

  it.each([
    ["not an address", "gateway.example.com", "not-an-address"],
    ["not http or https", "ftp://gateway.example.com", "not-an-address"],
    ["a user name", "https://user@gateway.example.com", "has-user-info"],
    ["a user name and password", withUserInfo("user", "fake-pw"), "has-user-info"],
  ])("refuses an address that is %s", async (_label, address, problem) => {
    const store = new FileSecretStore(await freshFile());
    await store.set("openai-key", "sk-test");

    expect(await store.addAllowedOrigin("openai-key", address)).toEqual({
      result: "bad-address",
      problem,
    });
    expect(await store.allowedOrigins("openai-key")).toBeUndefined();
  });

  it("answers no-key for a name with no stored secret and for a name that breaks the rule", async () => {
    const store = new FileSecretStore(await freshFile());

    expect(await store.addAllowedOrigin("missing-key", gateway)).toEqual({ result: "no-key" });
    expect(await store.addAllowedOrigin("not a name", gateway)).toEqual({ result: "no-key" });
  });

  it("answers full at the most origins and writes nothing", async () => {
    const store = new FileSecretStore(await freshFile());
    await store.set("openai-key", "sk-test");
    const eight = Array.from({ length: 8 }, (_, index) => `https://host${index}.example.com`);
    await store.setAllowedOrigins("openai-key", eight);

    expect(await store.addAllowedOrigin("openai-key", gateway)).toEqual({ result: "full" });
    expect(await store.allowedOrigins("openai-key")).toEqual(eight);
  });
});
