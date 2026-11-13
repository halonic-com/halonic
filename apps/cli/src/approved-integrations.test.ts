import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { approvedIntegrations } from "./approved-integrations.ts";

verifies("workspace.declared-tools", () => {
  it("passes no integration to a run without a trust grant", async () => {
    // The folder isn't read at all: a path that holds nothing would also give none.
    expect(await approvedIntegrations(null, "/nowhere/acme")).toEqual([]);
  });
});
