import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { approvedExample, webDigest } from "./approved-sign-in.test-helper.ts";
import { createSignInGrants } from "./sign-in-grants.ts";

// Fake values only; none is real.
const fakeRefreshToken = "fake-refresh-token-0000000001";
const tokenName = "s6_gitlab_work-account";

function setup() {
  const values = new Map<string, string>();
  const tokens = {
    get: async (name: string) => values.get(name) ?? null,
    set: async (name: string, value: string) => void values.set(name, value),
    remove: async (name: string) => void values.delete(name),
  };
  return { values, grants: createSignInGrants(tokens, webDigest) };
}

const grant = { refreshToken: fakeRefreshToken, approved: approvedExample };

verifies("oauth-sign-in.sign-in-grants", () => {
  it("finds nothing when nothing is saved", async () => {
    const { grants } = setup();

    expect(await grants.load("gitlab", "work-account", approvedExample)).toEqual({ kind: "none" });
  });

  it("gives back a saved grant as current for the same sign-in", async () => {
    const { grants, values } = setup();

    await grants.save("gitlab", "work-account", grant);

    expect([...values.keys()]).toEqual([tokenName]);
    expect(await grants.load("gitlab", "work-account", approvedExample)).toEqual({
      kind: "current",
      grant,
    });
  });

  it("calls the grant stale when the sign-in changed, and keeps what the user approved", async () => {
    const { grants } = setup();
    await grants.save("gitlab", "work-account", grant);
    const hostile = { ...approvedExample, revokeUrl: "https://evil.example.com/revoke" };

    const found = await grants.load("gitlab", "work-account", hostile);

    expect(found).toEqual({ kind: "stale", grant });
  });

  it("checks on every load, not only the first", async () => {
    const { grants } = setup();
    await grants.save("gitlab", "work-account", grant);
    const changed = { ...approvedExample, tokenUrl: "https://auth.example.org/oauth/token" };

    expect((await grants.load("gitlab", "work-account", changed)).kind).toBe("stale");
    expect((await grants.load("gitlab", "work-account", approvedExample)).kind).toBe("current");
  });

  it("drops a record that isn't JSON or doesn't match its own hash", async () => {
    const { grants, values } = setup();
    values.set(tokenName, "not json");
    expect(await grants.load("gitlab", "work-account", approvedExample)).toEqual({ kind: "none" });
    expect(values.has(tokenName)).toBe(false);

    await grants.save("gitlab", "work-account", grant);
    const edited = JSON.parse(values.get(tokenName) ?? "{}");
    edited.approved.revokeUrl = "https://evil.example.com/revoke";
    values.set(tokenName, JSON.stringify(edited));
    expect(await grants.load("gitlab", "work-account", approvedExample)).toEqual({ kind: "none" });
    expect(values.has(tokenName)).toBe(false);
  });

  it("refuses to save a refresh token that isn't usable, and writes nothing", async () => {
    const { grants, values } = setup();

    for (const refreshToken of ["short", "has a space 0000000000"]) {
      await expect(
        grants.save("gitlab", "work-account", { ...grant, refreshToken }),
      ).rejects.toThrow(RangeError);
    }
    expect(values.size).toBe(0);
  });

  it("keeps grants of other sign-ins apart and removes only the one asked for", async () => {
    const { grants } = setup();
    await grants.save("gitlab", "work-account", grant);
    await grants.save("gitlab", "other-account", grant);

    await grants.remove("gitlab", "work-account");
    await grants.remove("gitlab", "work-account");

    expect((await grants.load("gitlab", "work-account", approvedExample)).kind).toBe("none");
    expect((await grants.load("gitlab", "other-account", approvedExample)).kind).toBe("current");
  });
});
