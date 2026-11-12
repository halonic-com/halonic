import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { account, fakeAccounts, record } from "./accounts.test-helper.ts";
import { googleSetupSource } from "./google-setup-source.ts";

const done = ["project", "apis", "consent", "scopes", "client", "credentials", "sign-in"];

verifies("google-setup.setup-source", () => {
  it("lists only the accounts that need you", async () => {
    const fake = fakeAccounts([account(record(["project"])), account(record(done))]);
    const entries = await googleSetupSource(fake.source).list();
    expect(entries.map((entry) => entry.account)).toEqual(["gaccount_1"]);
  });

  it("is the Google provider", () => {
    const source = googleSetupSource(fakeAccounts([]).source);
    expect([source.provider, source.name]).toEqual(["google", "Google"]);
  });

  it("passes the accounts' changes on and stops when told", () => {
    const fake = fakeAccounts([]);
    const calls: number[] = [];
    const stop = googleSetupSource(fake.source).subscribe(() => calls.push(1));
    fake.change([account(record([]))]);
    stop();
    fake.change([]);
    expect(calls).toHaveLength(1);
    expect(fake.listeners.size).toBe(0);
  });
});
