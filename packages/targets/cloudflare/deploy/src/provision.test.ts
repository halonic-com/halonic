import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { UnmarkedResourcesError } from "./errors.ts";
import { fakeCloudflareApi } from "./fake-api.ts";
import { provision } from "./provision.ts";

const base = { accountId: "a1", worker: "halonic-dev" };

verifies("deploy.provision", () => {
  it("creates what is missing and leaves the worker to the upload", async () => {
    const api = fakeCloudflareApi({ accounts: [] });
    const steps = await provision(api, base);
    expect(steps).toEqual([
      { kind: "database", name: "halonic-dev-data", action: "create" },
      { kind: "bucket", name: "halonic-dev-blobs", action: "create" },
      { kind: "worker", name: "halonic-dev", action: "create" },
    ]);
    expect(api.calls.filter((c) => c.startsWith("createResource"))).toEqual([
      "createResource database halonic-dev-data",
      "createResource bucket halonic-dev-blobs",
    ]);
  });

  it("uses marked resources without touching them", async () => {
    const api = fakeCloudflareApi({
      accounts: [],
      resources: {
        "database halonic-dev-data": { marked: true },
        "bucket halonic-dev-blobs": { marked: true },
        "worker halonic-dev": { marked: true },
      },
    });
    const steps = await provision(api, base);
    expect(steps.every((s) => s.action === "use")).toBe(true);
    expect(api.calls.every((c) => c.startsWith("findResource"))).toBe(true);
  });

  it("refuses unmarked resources and names each one", async () => {
    const api = fakeCloudflareApi({
      accounts: [],
      resources: {
        "database halonic-dev-data": { marked: false },
        "worker halonic-dev": { marked: false },
      },
    });
    const error = await provision(api, base).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnmarkedResourcesError);
    expect((error as UnmarkedResourcesError).resources).toEqual([
      { kind: "database", name: "halonic-dev-data" },
      { kind: "worker", name: "halonic-dev" },
    ]);
    expect(api.calls.some((c) => c.startsWith("createResource"))).toBe(false);
  });

  it("adopts unmarked resources only when asked", async () => {
    const api = fakeCloudflareApi({
      accounts: [],
      resources: { "database halonic-dev-data": { marked: false } },
    });
    const steps = await provision(api, { ...base, adopt: true });
    expect(steps[0]).toEqual({ kind: "database", name: "halonic-dev-data", action: "adopt" });
    expect(api.calls).toContain("adoptResource database halonic-dev-data");
  });

  it("writes nothing in plan mode", async () => {
    const api = fakeCloudflareApi({
      accounts: [],
      resources: { "bucket halonic-dev-blobs": { marked: false } },
      failOnWrite: true,
    });
    const steps = await provision(api, { ...base, plan: true, adopt: true });
    expect(steps.map((s) => s.action)).toEqual(["create", "adopt", "create"]);
  });

  it("rejects a worker name that isn't a plain name", async () => {
    await expect(
      provision(fakeCloudflareApi({ accounts: [] }), { ...base, worker: "x'; --" }),
    ).rejects.toThrow(RangeError);
  });
});
