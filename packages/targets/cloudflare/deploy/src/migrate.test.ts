import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { DeployError } from "./errors.ts";
import { fakeCloudflareApi } from "./fake-api.ts";
import { migrate } from "./migrate.ts";

const migrations = ["0001-a", "0002-b", "0003-c"].map((id) => ({
  id,
  statements: [`CREATE TABLE t_${id.slice(0, 4)} (x TEXT)`],
}));
const base = { accountId: "a1", worker: "halonic-dev", migrations };

verifies("deploy.migrate", () => {
  it("applies only what the database hasn't, in order", async () => {
    const api = fakeCloudflareApi({ accounts: [], applied: ["0001-a", "0002-b"] });
    expect(await migrate(api, base)).toEqual(["0003-c"]);
    expect(api.calls).toEqual(["appliedMigrations", "applyMigration 0003-c"]);
  });

  it("applies everything to a new database", async () => {
    const api = fakeCloudflareApi({ accounts: [] });
    await migrate(api, base);
    expect(api.calls.slice(1)).toEqual(migrations.map((m) => `applyMigration ${m.id}`));
  });

  it("does nothing when the database is current", async () => {
    const api = fakeCloudflareApi({ accounts: [], applied: migrations.map((m) => m.id) });
    expect(await migrate(api, base)).toEqual([]);
    expect(api.calls).toEqual(["appliedMigrations"]);
  });

  it("refuses a database that is ahead of this version, before changing anything", async () => {
    const api = fakeCloudflareApi({ accounts: [], applied: ["0001-a", "0009-new"] });
    const error = await migrate(api, base).catch((e: unknown) => e);
    expect((error as DeployError).code).toBe("schema-newer-than-cli");
    expect((error as DeployError).message).toContain("0009-new");
    expect(api.calls).toEqual(["appliedMigrations"]);
  });

  it("lists pending migrations in plan mode and writes nothing", async () => {
    const api = fakeCloudflareApi({ accounts: [], applied: ["0001-a"], failOnWrite: true });
    expect(await migrate(api, { ...base, plan: true })).toEqual(["0002-b", "0003-c"]);
  });

  it("rejects duplicate ids", async () => {
    const api = fakeCloudflareApi({ accounts: [] });
    const dup = [...migrations, migrations[0] as (typeof migrations)[number]];
    const error = await migrate(api, { ...base, migrations: dup }).catch((e: unknown) => e);
    expect((error as DeployError).code).toBe("invalid-migrations");
  });
});
