import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { fakeCloudflareApi } from "./fake-api.ts";
import { status } from "./status.ts";
import { parseVersionNote, versionNote } from "./version-note.ts";

const commit = "0123456789abcdef0123456789abcdef01234567";
const bundle = "fedcba9876543210".repeat(4);
const ok = (async () => Response.json({ status: "ok" })) as typeof fetch;
const base = { accountId: "a1", worker: "halonic-dev" };

verifies("deploy.status", () => {
  it("names the live commit and bundle, and compares them with the caller's", async () => {
    const api = fakeCloudflareApi({
      accounts: [],
      deployment: [{ id: "v2", percentage: 100 }],
      versionMessages: { v2: versionNote({ commit, bundleHash: bundle, message: "ship it" }) },
      failOnWrite: true,
    });
    const result = await status(api, {
      ...base,
      local: { commit, bundleHash: bundle.replace(/^fedc/, "0000") },
      fetch: ok,
    });
    expect(result).toMatchObject({
      deployed: true,
      url: "https://halonic-dev.test.workers.dev",
      commit: commit.slice(0, 12),
      bundleHash: bundle.slice(0, 12),
      commitMatches: true,
      bundleMatches: false,
      splitTraffic: false,
      health: { state: "ok" },
    });
  });

  it("lists both versions of a split", async () => {
    const api = fakeCloudflareApi({
      accounts: [],
      deployment: [
        { id: "v1", percentage: 60 },
        { id: "v2", percentage: 40 },
      ],
      versionMessages: { v1: versionNote({ commit, bundleHash: bundle }) },
    });
    const result = await status(api, { ...base, fetch: ok });
    expect(result.splitTraffic).toBe(true);
    expect(result.versions.map((v) => v.id)).toEqual(["v1", "v2"]);
    expect(result.commit).toBe(commit.slice(0, 12));
    expect(result.commitMatches).toBeUndefined();
  });

  it("says deployed false for a Worker with no live version", async () => {
    const api = fakeCloudflareApi({ accounts: [] });
    expect(await status(api, base)).toMatchObject({ deployed: false, versions: [] });
  });

  it("reports an unreachable or unhealthy Worker without throwing", async () => {
    const api = fakeCloudflareApi({ accounts: [], deployment: [{ id: "v1", percentage: 100 }] });
    const down = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    const broken = (async () => new Response("no", { status: 500 })) as typeof fetch;
    expect((await status(api, { ...base, fetch: down })).health).toEqual({ state: "unreachable" });
    expect((await status(api, { ...base, fetch: broken })).health).toEqual({
      state: "unhealthy",
      httpStatus: 500,
    });
  });

  it("has no address to ask when workers.dev is off", async () => {
    const api = fakeCloudflareApi({
      accounts: [],
      deployment: [{ id: "v1", percentage: 100 }],
      workersDevOff: true,
    });
    const result = await status(api, base);
    expect(result.url).toBeUndefined();
    expect(result.health).toEqual({ state: "no-address" });
  });

  it("writes a note that reads back and fits Cloudflare's limit", () => {
    const note = versionNote({ commit, bundleHash: bundle, message: "x".repeat(300) });
    expect(note.length).toBe(100);
    expect(parseVersionNote(note)).toEqual({
      commit: commit.slice(0, 12),
      bundleHash: bundle.slice(0, 12),
    });
    expect(parseVersionNote("hand made")).toBeUndefined();
  });
});
