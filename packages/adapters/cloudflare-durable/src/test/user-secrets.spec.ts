// A person's sealed secrets in their usage object, over RPC (see `user-secrets-object.test.ts`).

import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { UsageObject } from "../usage-object.ts";

export { UsageObject };

/** What the runner binds for this suite. */
interface TestEnv {
  USAGE: DurableObjectNamespace<UsageObject>;
}

function objectOf(name: string) {
  const { USAGE } = env as unknown as TestEnv;
  return USAGE.get(USAGE.idFromName(name));
}

describe("UsageObject user secrets", () => {
  it("keeps a person's sealed secrets and data key in their own object", async () => {
    const scope = "u/eu_acmeSecretsAAAAAAAA";
    const usage = objectOf(scope);
    expect(await usage.userSecretNames(scope)).toEqual([]);
    expect(await usage.keepUserSecretDataKey(scope, "uk1.first")).toBe("uk1.first");
    expect(await usage.keepUserSecretDataKey(scope, "uk1.second")).toBe("uk1.first");
    await usage.putUserSecret(scope, "GITHUB_TOKEN", "us1.1.sealed");
    expect(await usage.userSecretDataKey(scope)).toBe("uk1.first");
    expect(await usage.userSecret(scope, "GITHUB_TOKEN")).toBe("us1.1.sealed");
    expect(await usage.userSecretNames(scope)).toEqual(["GITHUB_TOKEN"]);
    await usage.removeUserSecret(scope, "GITHUB_TOKEN");
    expect(await usage.userSecret(scope, "GITHUB_TOKEN")).toBeNull();
  });

  it("refuses an organisation's scope, and a scope other than the object's name", async () => {
    const organisation = objectOf("o/acme-secrets");
    await expect(
      organisation.putUserSecret("o/acme-secrets", "GITHUB_TOKEN", "us1.1.sealed"),
    ).rejects.toThrow(/Only a person's scope/);
    await expect(organisation.userSecretNames("o/acme-secrets")).rejects.toThrow(
      /Only a person's scope/,
    );
    const alice = objectOf("u/eu_aliceSecretsAAAAAAA");
    await alice.putUserSecret("u/eu_aliceSecretsAAAAAAA", "GITHUB_TOKEN", "us1.1.alice");
    for (const read of [
      () => alice.userSecret("u/eu_bobSecretsAAAAAAAAA", "GITHUB_TOKEN"),
      () => alice.userSecretNames("u/eu_bobSecretsAAAAAAAAA"),
      () => alice.userSecretDataKey("u/eu_bobSecretsAAAAAAAAA"),
      () => alice.removeUserSecret("u/eu_bobSecretsAAAAAAAAA", "GITHUB_TOKEN"),
    ]) {
      await expect(read()).rejects.toThrow(/named for another scope/);
    }
  });

  it("reads note no scope, so listing an unused object leaves it empty", async () => {
    const scope = "u/eu_unusedSecretsAAAAAA";
    const usage = objectOf(scope);
    expect(await usage.userSecretNames(scope)).toEqual([]);
    expect(await usage.userSecretDataKey(scope)).toBeNull();
    expect(await usage.eraseIfSent(scope)).toEqual({ unsent: 0 });
  });

  it("drops the secrets with the rest of the object when the scope is erased", async () => {
    const scope = "u/eu_erasedSecretsAAAAAA";
    const usage = objectOf(scope);
    await usage.keepUserSecretDataKey(scope, "uk1.first");
    await usage.putUserSecret(scope, "GITHUB_TOKEN", "us1.1.sealed");
    expect(await usage.eraseIfSent(scope)).toEqual({ unsent: 0 });
    expect(await usage.userSecretNames(scope)).toEqual([]);
    expect(await usage.userSecretDataKey(scope)).toBeNull();
  });
});
