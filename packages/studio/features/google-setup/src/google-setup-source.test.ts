import { clockTime } from "@halonicjs/studio-feature-inbox/api";
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

  it("tells the refused time from the clock it is given", async () => {
    const at = new Date(2026, 10, 3, 2, 10).toISOString();
    const refused = record(done, { refreshRefused: { reason: "sign-in", at } });
    const source = googleSetupSource(
      fakeAccounts([account(refused)]).source,
      clockTime,
      () => new Date(2026, 10, 12, 15, 30),
    );
    expect((await source.list())[0]?.progress).toBe("Needs sign-in since Tue 3 Nov, 02:10");
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
