import { MemoryTrustStore } from "@halonicjs/adapter-memory";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { trustedSourcesOf } from "./trusted-sources.ts";

verifies("workspace.trusted-sources", () => {
  it("lists the profile's records by folder name and removes one", async () => {
    const store = new MemoryTrustStore();
    await store.grant({
      location: "/work/inbox-helper",
      fingerprint: "hfp1:a",
      content: {},
      grantedAt: "2026-11-03T12:00:00.000Z",
      appVersion: "0.1.0",
      pins: {},
      origin: "prompt",
    });
    const host = trustedSourcesOf(store);
    expect(await host.list()).toEqual([
      {
        location: "/work/inbox-helper",
        name: "inbox-helper",
        trustedAt: "2026-11-03T12:00:00.000Z",
      },
    ]);
    await host.remove("/work/inbox-helper");
    expect(await host.list()).toEqual([]);
  });
});
